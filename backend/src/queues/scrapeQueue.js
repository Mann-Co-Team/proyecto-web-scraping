const { EventEmitter } = require('events');
const { scrapeUrl } = require('../services/puppeteerService');
const pool = require('../config/db');
const dns = require('dns').promises;
const { URL } = require('url');
const ee = new EventEmitter();

const concurrency = Number(process.env.SCRAPE_CONCURRENCY || 3);
const queue = [];
let active = 0;

function enqueueScrape(payload) {
  const jobId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  queue.push({ id: jobId, payload });
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
    const { address } = await dns.lookup(host);
    // simple checks for private ranges
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(address)) return false;
    // 172.16.0.0 - 172.31.255.255
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
    // optional: update DB job status -> 'processing'
    const { targetUrl, jobReference, userId } = payload;
    // perform scrape
    const result = await scrapeUrl(targetUrl);
    // persist result (ajusta columnas según tu schema)
    await pool.query(
      'INSERT INTO scraping_results (job_id, job_reference, data, created_at) VALUES (?, ?, ?, NOW())',
      [id, jobReference || null, JSON.stringify(result)]
    );
    // optional: update DB job status -> 'finished'
    ee.emit('done', { id, payload, result });
  } catch (err) {
    // log and persist failure record si lo deseas
    await pool.query(
      'INSERT INTO scraping_results (job_id, job_reference, data, created_at, error) VALUES (?, ?, ?, NOW(), ?)',
      [id, payload.jobReference || null, null, err.message ? err.message : String(err)]
    ).catch(()=>{});
    ee.emit('failed', { id, payload, error: err });
  } finally {
    active--;
    // procesa siguiente
    setImmediate(processQueue);
  }
}

// arrancar workers automáticamente al requerir el módulo
for (let i = 0; i < concurrency; i++) setImmediate(processQueue);

module.exports = {
  enqueueScrape,
  events: ee,
  isPublicUrl,
};