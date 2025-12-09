const slugify = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

const DEFAULT_TTL_MS = Math.min(
  Math.max(Number(process.env.ML_CACHE_TTL_MS) || 180000, 30000),
  900000
);

const cacheStore = new Map();

const buildCacheKey = ({ query, location, stateId } = {}) => {
  const normalized = [stateId, location, query]
    .map((token) => slugify(token || 'any'))
    .join('|');
  return normalized || 'default';
};

const now = () => Date.now();

const getCachedListings = (key) => {
  if (!key) return null;
  const entry = cacheStore.get(key);
  if (!entry) return null;
  const age = now() - entry.timestamp;
  if (age > entry.ttl) {
    cacheStore.delete(key);
    return null;
  }
  return {
    listings: entry.payload.listings || [],
    requestUrl: entry.payload.requestUrl || null,
    usedFallback: Boolean(entry.payload.usedFallback),
    detailBudgetExceeded: Boolean(entry.payload.detailBudgetExceeded),
    fetchedAt: entry.timestamp,
    cacheAgeMs: age,
  };
};

const setCachedListings = (key, payload, { ttlMs } = {}) => {
  if (!key || !payload) return;
  const ttl = Math.min(Math.max(Number(ttlMs) || DEFAULT_TTL_MS, 1000), 900000);
  cacheStore.set(key, {
    payload,
    ttl,
    timestamp: now(),
  });
};

const clearCachedListings = (key) => {
  if (key) {
    cacheStore.delete(key);
  }
};

const flushCache = () => {
  cacheStore.clear();
};

module.exports = {
  buildCacheKey,
  getCachedListings,
  setCachedListings,
  clearCachedListings,
  flushCache,
  DEFAULT_TTL_MS,
};
