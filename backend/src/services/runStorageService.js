const crypto = require('crypto');
const pool = require('../config/db');
const { sanitizePageNumber } = require('./yapoScraper');

const MAX_RUN_PAGES = Number(process.env.SCRAPE_RUN_MAX_PAGES || 50);
const DEFAULT_FRESHNESS_MINUTES = Number(process.env.SCRAPE_RUN_TTL_MINUTES || 60);
const MAX_PAGE_RETRIES = Number(process.env.SCRAPE_RUN_PAGE_RETRIES || 2);

const hashQuerySignature = ({ region, category, searchTerm = '' }) => {
  const normalized = `${region}|${category}|${searchTerm}`.toLowerCase();
  return crypto.createHash('sha1').update(normalized).digest('hex');
};

const mapRunRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    region: row.region,
    category: row.category,
    searchTerm: row.search_term || '',
    queryHash: row.query_hash,
    maxPages: row.max_pages,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
};

const normalizePageBatch = (pageNumbers = [], maxPages = MAX_RUN_PAGES) => {
  const sanitized = pageNumbers
    .map((value) => sanitizePageNumber(value))
    .filter((value) => value !== null && value <= maxPages && value >= 1);
  return Array.from(new Set(sanitized)).sort((a, b) => a - b);
};

async function getRunById(runId) {
  const [rows] = await pool.query('SELECT * FROM scrape_runs WHERE id = ? LIMIT 1', [runId]);
  return mapRunRow(rows[0]);
}

async function findReusableRun({ region, category, searchTerm, freshnessMinutes = DEFAULT_FRESHNESS_MINUTES }) {
  const queryHash = hashQuerySignature({ region, category, searchTerm });
  const [rows] = await pool.query(
    `SELECT * FROM scrape_runs
     WHERE query_hash = ?
       AND status = 'completed'
       AND completed_at IS NOT NULL
       AND completed_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
     ORDER BY completed_at DESC
     LIMIT 1`,
    [queryHash, freshnessMinutes]
  );
  return mapRunRow(rows[0]);
}

async function findLastCompletedRun({ region, category, searchTerm }) {
  const queryHash = hashQuerySignature({ region, category, searchTerm });
  const [rows] = await pool.query(
    `SELECT * FROM scrape_runs
     WHERE query_hash = ? AND status = 'completed'
     ORDER BY completed_at DESC
     LIMIT 1`,
    [queryHash]
  );
  return mapRunRow(rows[0]);
}

async function createRun({ region, category, searchTerm, maxPages }) {
  const queryHash = hashQuerySignature({ region, category, searchTerm });
  const cappedPages = Math.min(Math.max(1, Number(maxPages) || 1), MAX_RUN_PAGES);
  const [result] = await pool.query(
    `INSERT INTO scrape_runs (region, category, search_term, query_hash, max_pages, status)
     VALUES (?, ?, ?, ?, ?, 'queued')`,
    [region, category, searchTerm || null, queryHash, cappedPages]
  );
  return mapRunRow({
    id: result.insertId,
    region,
    category,
    search_term: searchTerm || '',
    query_hash: queryHash,
    max_pages: cappedPages,
    status: 'queued',
    started_at: null,
    completed_at: null,
    created_at: new Date(),
  });
}

async function markRunStarted(runId) {
  await pool.query(
    `UPDATE scrape_runs
     SET status = 'running', started_at = COALESCE(started_at, NOW())
     WHERE id = ? AND status IN ('queued', 'running')`,
    [runId]
  );
}

async function markRunCompleted(runId) {
  await pool.query(
    `UPDATE scrape_runs
     SET status = 'completed', completed_at = NOW()
     WHERE id = ?`,
    [runId]
  );
}

async function markRunFailed(runId) {
  await pool.query(
    `UPDATE scrape_runs
     SET status = 'failed'
     WHERE id = ?`,
    [runId]
  );
}

async function addRunPages(run, pageNumbers = []) {
  const sanitized = normalizePageBatch(pageNumbers, run.maxPages);
  if (!sanitized.length) return [];
  const placeholders = sanitized.map(() => '?').join(', ');
  const params = [run.id, ...sanitized];
  const [existing] = await pool.query(
    `SELECT page_number FROM scrape_run_pages
     WHERE run_id = ? AND page_number IN (${placeholders})`,
    params
  );
  const existingSet = new Set(existing.map((row) => row.page_number));
  const toInsert = sanitized.filter((page) => !existingSet.has(page));
  if (!toInsert.length) {
    return [];
  }
  const values = toInsert.map(() => '(?, ?)').join(', ');
  const insertParams = [];
  toInsert.forEach((page) => {
    insertParams.push(run.id, page);
  });
  await pool.query(
    `INSERT INTO scrape_run_pages (run_id, page_number)
     VALUES ${values}`,
    insertParams
  );
  return toInsert;
}

async function registerPaginationPages(run, pagination = {}, currentPage) {
  if (!pagination) return [];
  const candidates = new Set();
  if (Array.isArray(pagination.pages)) {
    pagination.pages.forEach((page) => candidates.add(page));
  }
  if (pagination.nextPage) candidates.add(pagination.nextPage);
  if (pagination.prevPage) candidates.add(pagination.prevPage);
  if (Number.isFinite(currentPage)) {
    candidates.add(Number(currentPage) + 1);
  }
  return addRunPages(run, Array.from(candidates));
}

async function markPageRunning(runId, pageNumber) {
  await pool.query(
    `UPDATE scrape_run_pages
     SET status = 'running', attempts = attempts + 1, error = NULL
     WHERE run_id = ? AND page_number = ?`,
    [runId, pageNumber]
  );
}

async function markPageCompleted(runId, pageNumber) {
  await pool.query(
    `UPDATE scrape_run_pages
     SET status = 'completed', fetched_at = NOW()
     WHERE run_id = ? AND page_number = ?`,
    [runId, pageNumber]
  );
}

async function markPageFailed(runId, pageNumber, errorMessage) {
  await pool.query(
    `UPDATE scrape_run_pages
     SET status = 'failed', error = ?, fetched_at = NOW()
     WHERE run_id = ? AND page_number = ?`,
    [errorMessage || 'Error desconocido', runId, pageNumber]
  );
}

async function shouldRetryPage(runId, pageNumber) {
  const [rows] = await pool.query(
    `SELECT attempts FROM scrape_run_pages WHERE run_id = ? AND page_number = ?`,
    [runId, pageNumber]
  );
  if (!rows[0]) return false;
  return rows[0].attempts < MAX_PAGE_RETRIES;
}

async function refreshRunCompletion(runId) {
  const [rows] = await pool.query(
    `SELECT
        SUM(status = 'completed') AS completed,
        SUM(status = 'pending') AS pending,
        SUM(status = 'running') AS running,
        SUM(status = 'failed') AS failed
     FROM scrape_run_pages
     WHERE run_id = ?`,
    [runId]
  );
  const rawStats = rows[0] || { completed: 0, pending: 0, running: 0, failed: 0 };
  const stats = {
    completed: Number(rawStats.completed) || 0,
    pending: Number(rawStats.pending) || 0,
    running: Number(rawStats.running) || 0,
    failed: Number(rawStats.failed) || 0,
  };

  if ((stats.pending + stats.running) === 0 && stats.completed > 0) {
    await markRunCompleted(runId);
  } else if (stats.failed > 0 && stats.completed === 0 && stats.pending === 0 && stats.running === 0) {
    await markRunFailed(runId);
  }
  return stats;
}

async function upsertListings(runId, pageNumber, listings = []) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `DELETE la FROM listing_attributes la
       JOIN listings l ON l.id = la.listing_id
       WHERE l.run_id = ? AND l.page_number = ?`,
      [runId, pageNumber]
    );
    await connection.query('DELETE FROM listings WHERE run_id = ? AND page_number = ?', [runId, pageNumber]);

    const attributeBuffer = [];

    for (const listing of listings) {
      const [result] = await connection.query(
        `INSERT INTO listings (
          run_id, page_number, external_id, title, description, price_numeric, price_label,
          location, seller, property_type, bedroom_count, transaction_type, link, image, raw
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          description = VALUES(description),
          price_numeric = VALUES(price_numeric),
          price_label = VALUES(price_label),
          location = VALUES(location),
          seller = VALUES(seller),
          property_type = VALUES(property_type),
          bedroom_count = VALUES(bedroom_count),
          transaction_type = VALUES(transaction_type),
          link = VALUES(link),
          image = VALUES(image),
          raw = VALUES(raw),
          page_number = VALUES(page_number)`,
        [
          runId,
          pageNumber,
          listing.externalId,
          listing.title,
          listing.description,
          listing.priceNumeric,
          listing.priceLabel,
          listing.location,
          listing.seller,
          listing.propertyType,
          listing.bedroomCount,
          listing.transactionType,
          listing.link,
          listing.image,
          JSON.stringify(listing.raw || {}),
        ]
      );
      const listingId = result.insertId || (await connection.query(
        'SELECT id FROM listings WHERE run_id = ? AND external_id = ? LIMIT 1',
        [runId, listing.externalId]
      ))[0][0]?.id;
      if (listingId && Array.isArray(listing.details) && listing.details.length) {
        listing.details.slice(0, 8).forEach((detail) => {
          attributeBuffer.push([listingId, 'detail', detail]);
        });
      }
    }

    if (attributeBuffer.length) {
      const placeholders = attributeBuffer.map(() => '(?, ?, ?)').join(', ');
      const params = attributeBuffer.flat();
      await connection.query(
        `INSERT INTO listing_attributes (listing_id, label, value)
         VALUES ${placeholders}`,
        params
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const mapListingRow = (row) => {
  if (!row) return null;
  let rawData = {};
  if (row.raw) {
    try {
      rawData = JSON.parse(row.raw);
    } catch (_) {
      rawData = {};
    }
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price_label,
    priceNumeric: row.price_numeric,
    location: row.location,
    seller: row.seller,
    propertyType: row.property_type,
    bedroomCount: row.bedroom_count,
    transactionType: row.transaction_type,
    link: row.link,
    image: row.image,
    details: rawData.details || [],
    sourcePage: row.page_number,
    raw: rawData,
  };
};

async function fetchListings({ runId, filters, page, pageSize }) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const activePage = Math.max(1, Number(page) || 1);
  const clauses = ['run_id = ?'];
  const values = [runId];

  if (filters?.transaction) {
    clauses.push('transaction_type = ?');
    values.push(filters.transaction);
  }
  if (filters?.minPrice !== null && Number.isFinite(filters.minPrice)) {
    clauses.push('price_numeric IS NOT NULL AND price_numeric >= ?');
    values.push(filters.minPrice);
  }
  if (filters?.maxPrice !== null && Number.isFinite(filters.maxPrice)) {
    clauses.push('(price_numeric IS NULL OR price_numeric <= ?)');
    values.push(filters.maxPrice);
  }
  if (filters?.location) {
    clauses.push('LOWER(location) LIKE ?');
    values.push(`%${filters.location}%`);
  }
  if (filters?.searchTerm) {
    clauses.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)');
    values.push(`%${filters.searchTerm}%`, `%${filters.searchTerm}%`);
  }
  if (filters?.propertyType) {
    clauses.push('property_type = ?');
    values.push(filters.propertyType);
  }
  if (filters?.bedrooms && filters.bedrooms.length) {
    const numericBedrooms = [];
    let includeFourPlus = false;
    filters.bedrooms.forEach((value) => {
      if (String(value).toLowerCase() === '4+') {
        includeFourPlus = true;
        return;
      }
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        numericBedrooms.push(parsed);
      }
    });
    const bedroomClauses = [];
    const bedroomParams = [];
    if (numericBedrooms.length) {
      const placeholders = numericBedrooms.map(() => '?').join(', ');
      bedroomClauses.push(`bedroom_count IN (${placeholders})`);
      bedroomParams.push(...numericBedrooms);
    }
    if (includeFourPlus) {
      bedroomClauses.push('bedroom_count >= 4');
    }
    if (bedroomClauses.length) {
      clauses.push(`(${bedroomClauses.join(' OR ')})`);
      values.push(...bedroomParams);
    }
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM listings ${whereClause}`,
    values
  );
  const total = countRows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = (activePage - 1) * limit;
  const dataParams = [...values, limit, offset];
  const [rows] = await pool.query(
        `SELECT id, run_id, page_number, title, description, price_numeric, price_label, location,
          seller, property_type, bedroom_count, transaction_type, link, image, raw
     FROM listings
     ${whereClause}
     ORDER BY price_numeric IS NULL, price_numeric ASC, id ASC
     LIMIT ? OFFSET ?`,
    dataParams
  );
  const listings = rows.map(mapListingRow).filter(Boolean);

  const [distinctPages] = await pool.query(
    `SELECT DISTINCT page_number FROM listings WHERE run_id = ? ORDER BY page_number ASC`,
    [runId]
  );
  const pagesWithListings = distinctPages.map((row) => row.page_number);

  return {
    listings,
    total,
    totalPages,
    page: activePage,
    limit,
    pagesWithListings,
  };
}

async function fetchAllListingsForRun(runId) {
  const [rows] = await pool.query(
    `SELECT id, run_id, page_number, title, description, price_numeric, price_label, location,
        seller, property_type, bedroom_count, transaction_type, link, image, raw
     FROM listings
     WHERE run_id = ?
     ORDER BY price_numeric IS NULL, price_numeric ASC, id ASC`,
    [runId]
  );
  return rows.map(mapListingRow).filter(Boolean);
}

async function getRunProgress(runId) {
  const [pageRows] = await pool.query(
    `SELECT page_number, status FROM scrape_run_pages WHERE run_id = ? ORDER BY page_number ASC`,
    [runId]
  );
  const stats = {
    completed: 0,
    pending: 0,
    running: 0,
    failed: 0,
    pagesCompleted: [],
    pagesPending: [],
  };
  pageRows.forEach((row) => {
    if (row.status === 'completed') {
      stats.completed += 1;
      stats.pagesCompleted.push(row.page_number);
    } else if (row.status === 'pending') {
      stats.pending += 1;
      stats.pagesPending.push(row.page_number);
    } else if (row.status === 'running') {
      stats.running += 1;
    } else if (row.status === 'failed') {
      stats.failed += 1;
    }
  });

  const [[{ listingsCount }]] = await pool.query(
    'SELECT COUNT(*) AS listingsCount FROM listings WHERE run_id = ?',
    [runId]
  );

  return {
    ...stats,
    listingsCount,
  };
}

module.exports = {
  MAX_RUN_PAGES,
  hashQuerySignature,
  getRunById,
  findReusableRun,
  findLastCompletedRun,
  createRun,
  addRunPages,
  registerPaginationPages,
  markRunStarted,
  markRunCompleted,
  markRunFailed,
  markPageRunning,
  markPageCompleted,
  markPageFailed,
  shouldRetryPage,
  refreshRunCompletion,
  upsertListings,
  fetchListings,
  fetchAllListingsForRun,
  getRunProgress,
};
