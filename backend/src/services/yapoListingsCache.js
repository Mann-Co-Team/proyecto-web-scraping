const clampTtl = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 120000;
  return Math.min(Math.max(numeric, 1000), 900000);
};

const DEFAULT_TTL_MS = clampTtl(process.env.YAPO_CACHE_TTL_MS || 120000);
const store = new Map();

const getCachedRunListings = (runId, { expectedTotal } = {}) => {
  if (!runId) return null;
  const entry = store.get(runId);
  if (!entry) return null;
  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl) {
    store.delete(runId);
    return null;
  }
  if (Number.isFinite(expectedTotal) && entry.total !== expectedTotal) {
    store.delete(runId);
    return null;
  }
  return {
    listings: entry.listings,
    cacheAgeMs: age,
  };
};

const setCachedRunListings = (runId, listings = [], { ttlMs } = {}) => {
  if (!runId) return;
  const ttl = clampTtl(ttlMs || DEFAULT_TTL_MS);
  store.set(runId, {
    listings: Array.isArray(listings) ? listings : [],
    total: Array.isArray(listings) ? listings.length : 0,
    timestamp: Date.now(),
    ttl,
  });
};

const invalidateRunCache = (runId) => {
  if (!runId) return;
  store.delete(runId);
};

const flushYapoCache = () => {
  store.clear();
};

module.exports = {
  DEFAULT_TTL_MS,
  getCachedRunListings,
  setCachedRunListings,
  invalidateRunCache,
  flushYapoCache,
};
