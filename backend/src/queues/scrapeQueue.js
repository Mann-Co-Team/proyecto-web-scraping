const { EventEmitter } = require('events');
const { scrapeUrl } = require('../services/puppeteerService');
const pool = require('../config/db');
const dns = require('dns').promises;
const { URL } = require('url');
const crypto = require('crypto');

const ee = new EventEmitter();

const concurrency = Number(process.env.SCRAPE_CONCURRENCY || 3);
const queue = [];
let active = 0;

function generateJobId() {
  try {
    return crypto && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  }
}

function enqueueScrape(payload) {
  const jobId = generateJobId();
  queue.push({ id: jobId, payload });
  // trigger processing (workers must be started with startWorkers)
  setImmediate(processQueue);
  return jobId;
}

async function isPublicUrl(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const host = parsed.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  try {
    const lookup = await dns.lookup(host);
    const address = lookup && lookup.address ? lookup.address : '';
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(address)) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(address)) return false;
    return true;
  } catch {
    return false;
  }
}

async function processQueue() {
  if (active >= concurrency) return;
  const job = queue.shift();
  if (!job) return;
  active++;
  const { id, payload } = job;
  try {
    const { targetUrl, jobReference, userId } = payload;
    const result = await scrapeUrl(targetUrl);
    await pool.query(
      'INSERT INTO scraping_results (job_id, job_reference, data, created_at) VALUES (?, ?, ?, NOW())',
      [id, jobReference || null, JSON.stringify(result)]
    );
    ee.emit('done', { id, payload, result });
  } catch (err) {
    try {
      await pool.query(
        'INSERT INTO scraping_results (job_id, job_reference, data, created_at, error) VALUES (?, ?, ?, NOW(), ?)',
        [id, payload.jobReference || null, null, err && err.message ? err.message : String(err)]
      );
    } catch (_) { /* swallow DB persistence errors */ }
    ee.emit('failed', { id, payload, error: err });
  } finally {
    active--;
    setImmediate(processQueue);
  }
}

// Export a start function instead of auto-starting on require
function startWorkers() {
  for (let i = 0; i < concurrency; i++) {
    setImmediate(processQueue);
  }
}

module.exports = {
  enqueueScrape,
  events: ee,
  isPublicUrl,
  startWorkers,
};