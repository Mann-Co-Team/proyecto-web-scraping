const { EventEmitter } = require('events');
const { scrapeUrl } = require('../services/puppeteerService');
const pool = require('../config/db');
const { scrapeYapoPage, buildYapoUrl, sanitizePageNumber } = require('../services/yapoScraper');
const runStorage = require('../services/runStorageService');
const { normalizeListingForStorage } = require('../services/listingTransformer');
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

function enqueueRunPageJob(payload) {
  const jobId = generateJobId();
  queue.push({ id: jobId, payload: { ...payload, kind: 'run-page' } });
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
  const isRunPageJob = payload && payload.kind === 'run-page';
  try {
    if (isRunPageJob) {
      await handleRunPageJob(payload);
    } else {
      await handleLegacyScrapeJob(id, payload);
    }
  } catch (err) {
    if (isRunPageJob) {
      console.error('Error procesando página en run de scraping:', err);
    } else {
      try {
        await pool.query(
          'INSERT INTO scraping_results (job_id, job_reference, data, created_at, error) VALUES (?, ?, ?, NOW(), ?)',
          [id, payload.jobReference || null, null, err && err.message ? err.message : String(err)]
        );
      } catch (_) { /* swallow DB persistence errors */ }
      ee.emit('failed', { id, payload, error: err });
    }
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

async function handleLegacyScrapeJob(id, payload) {
  const { targetUrl, jobReference } = payload;
  const result = await scrapeUrl(targetUrl);
  await pool.query(
    'INSERT INTO scraping_results (job_id, job_reference, data, created_at) VALUES (?, ?, ?, NOW())',
    [id, jobReference || null, JSON.stringify(result)]
  );
  ee.emit('done', { id, payload, result });
}

async function handleRunPageJob(payload) {
  const { runId } = payload;
  let { pageNumber } = payload;
  if (!runId) {
    return;
  }
  const run = await runStorage.getRunById(runId);
  if (!run) {
    return;
  }
  const sanitizedPage = sanitizePageNumber(pageNumber) || 1;
  try {
    await runStorage.markRunStarted(run.id);
    await runStorage.markPageRunning(run.id, sanitizedPage);
    const targetUrl = buildYapoUrl({
      region: run.region,
      category: run.category,
      search: run.searchTerm,
      page: sanitizedPage,
    });
    const scrapeResult = await scrapeYapoPage(targetUrl);
    const normalizedListings = (scrapeResult.ads || []).map((ad) =>
      normalizeListingForStorage(ad, { pageNumber: sanitizedPage })
    );
    await runStorage.upsertListings(run.id, sanitizedPage, normalizedListings);
    await runStorage.markPageCompleted(run.id, sanitizedPage);
    if (scrapeResult.pagination) {
      const newPages = await runStorage.registerPaginationPages(run, scrapeResult.pagination, sanitizedPage);
      newPages.forEach((nextPage) => {
        if (nextPage !== sanitizedPage) {
          enqueueRunPageJob({ runId: run.id, pageNumber: nextPage });
        }
      });
    }
  } catch (error) {
    await runStorage.markPageFailed(run.id, sanitizedPage, error.message || 'Error durante el scraping');
    const retry = await runStorage.shouldRetryPage(run.id, sanitizedPage);
    if (retry) {
      enqueueRunPageJob({ runId: run.id, pageNumber: sanitizedPage });
    } else {
      console.error(`Scrape run ${run.id} página ${sanitizedPage} falló definitivamente`, error);
    }
  } finally {
    await runStorage.refreshRunCompletion(run.id);
  }
}

module.exports = {
  enqueueScrape,
  events: ee,
  isPublicUrl,
  startWorkers,
  enqueueRunPageJob,
};