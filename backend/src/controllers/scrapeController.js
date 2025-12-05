const { URL } = require('url');
const crypto = require('crypto');
const pool = require('../config/db');
const { enqueueScrape, isPublicUrl } = require('../queues/scrapeQueue');
const { initPuppeteer } = require('../services/puppeteerService');

const DEFAULT_REGION = 'maule';
const DEFAULT_CATEGORY = 'inmuebles';
const DEFAULT_URL = 'https://www.yapo.cl/maule/inmuebles?ca=15_s&o=1&w=1&ret=2&cmn=1&cm=1';
const ALLOWED_HOSTS = ['yapo.cl', 'www.yapo.cl'];
const RENT_KEYWORDS = ['arriendo', 'arrienda', 'arriende', 'arrendar', 'arriendo mensual', 'se arrienda', 'arriendo casa', 'arriendo depto'];
const SALE_KEYWORDS = ['venta', 'vende', 'vendo', 'se vende', 'en venta', 'compraventa', 'propiedad en venta'];
const TRANSACTION_PRIORITY = {
  rent: 0,
  unknown: 1,
  sale: 2,
};
const MAX_PAGE_BATCH = 8;

const sanitizePageNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const uniqueSortedPages = (values = []) => {
  const unique = Array.from(
    new Set(
      values
        .map((value) => sanitizePageNumber(value))
        .filter((value) => value !== null)
    )
  ).sort((a, b) => a - b);
  return unique.length ? unique : [1];
};

const buildPaginationSummary = (snapshot, fallbackPage = 1) => {
  const availablePages = Array.isArray(snapshot?.pages) && snapshot.pages.length
    ? snapshot.pages
    : [snapshot?.currentPage || fallbackPage];
  return {
    currentPage: snapshot?.currentPage || fallbackPage,
    totalPages: snapshot?.totalPages || uniqueSortedPages(availablePages).length,
    pages: uniqueSortedPages(availablePages),
    hasNext: Boolean(snapshot?.hasNext),
    hasPrev: Boolean(snapshot?.hasPrev),
    nextPage: snapshot?.nextPage || null,
    prevPage: snapshot?.prevPage || null,
    fetchedPages: [fallbackPage],
  };
};

const mergePaginationSummaries = (current, snapshot, fetchedPage) => {
  if (!current) {
    return buildPaginationSummary(snapshot, fetchedPage);
  }
  const additionPages = Array.isArray(snapshot?.pages) && snapshot.pages.length
    ? snapshot.pages
    : [snapshot?.currentPage || fetchedPage];
  const mergedPages = uniqueSortedPages([...current.pages, ...additionPages]);
  const fetchedPages = uniqueSortedPages([...(current.fetchedPages || []), fetchedPage]);
  return {
    ...current,
    pages: mergedPages,
    totalPages: Math.max(current.totalPages, snapshot?.totalPages || mergedPages.length),
    hasNext: current.hasNext || Boolean(snapshot?.hasNext),
    hasPrev: current.hasPrev || Boolean(snapshot?.hasPrev),
    nextPage: snapshot?.nextPage || current.nextPage,
    prevPage: snapshot?.prevPage || current.prevPage,
    fetchedPages,
  };
};

const attachSourcePage = (ads = [], pageNumber = 1) =>
  ads.map((ad) => ({
    ...ad,
    sourcePage: pageNumber,
  }));

const enqueuePages = (values = [], queue = [], visited = new Set()) => {
  values.forEach((value) => {
    const sanitized = sanitizePageNumber(value);
    if (!sanitized) return;
    if (visited.has(sanitized)) return;
    if (queue.includes(sanitized)) return;
    queue.push(sanitized);
  });
};

const normalizeNumberParam = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildYapoUrl = ({
  region = DEFAULT_REGION,
  category = DEFAULT_CATEGORY,
  search = '',
  page = 1,
}) => {
  try {
    const url = new URL(`https://www.yapo.cl/${region}/${category}`);
    url.searchParams.set('o', page);
    url.searchParams.set('ca', '15_s');
    url.searchParams.set('w', '1');
    url.searchParams.set('ret', '2');
    if (search) {
      url.searchParams.set('q', search);
    }
    return url.toString();
  } catch (_) {
    return DEFAULT_URL;
  }
};

const assertYapoUrl = (targetUrl) => {
  const parsed = new URL(targetUrl);
  if (!ALLOWED_HOSTS.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    throw new Error('Solo se permiten URLs de yapo.cl');
  }
  return parsed.toString();
};

const generateResultId = () => {
  try {
    return typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  } catch (_) {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
};

const persistScrapeResult = async ({ data, jobReference = null, error = null }) => {
  const serialized = JSON.stringify(data ?? {});
  const jobId = generateResultId();
  try {
    if (error) {
      await pool.query(
        'INSERT INTO scraping_results (job_id, job_reference, data, created_at, error) VALUES (?, ?, ?, NOW(), ?)',
        [jobId, jobReference, serialized, error]
      );
    } else {
      await pool.query(
        'INSERT INTO scraping_results (job_id, job_reference, data, created_at) VALUES (?, ?, ?, NOW())',
        [jobId, jobReference, serialized]
      );
    }
  } catch (dbErr) {
    console.error('Error guardando resultado de scraping:', dbErr);
  }
};

const detectTransactionType = (ad = {}) => {
  const datasetHint = String(ad.transactionType || ad.transaction || '').toLowerCase();
  if (datasetHint.includes('rent') || datasetHint.includes('arriendo')) {
    return 'rent';
  }
  if (datasetHint.includes('sale') || datasetHint.includes('venta') || datasetHint.includes('vend')) {
    return 'sale';
  }

  const haystackParts = [ad.title, ad.description, ad.price, ad.location, ad.seller]
    .concat(Array.isArray(ad.details) ? ad.details : [])
    .filter(Boolean);
  const haystack = haystackParts.join(' ').toLowerCase();

  if (RENT_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return 'rent';
  }

  if (SALE_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return 'sale';
  }

  if (ad.link) {
    const link = String(ad.link).toLowerCase();
    if (link.includes('arriendo')) return 'rent';
    if (link.includes('venta')) return 'sale';
  }

  return 'unknown';
};

const prioritizeListings = (ads = []) =>
  ads
    .map((ad) => ({
      ...ad,
      transactionType: detectTransactionType(ad),
    }))
    .sort((a, b) => (TRANSACTION_PRIORITY[a.transactionType] ?? 1) - (TRANSACTION_PRIORITY[b.transactionType] ?? 1));

const scrapeYapoPage = async (targetUrl) => {
  const browser = await initPuppeteer();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 768 });
    page.setDefaultNavigationTimeout(90_000);

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });

    try {
      await page.waitForSelector('#currentlistings', { timeout: 20_000 });
    } catch (_) {
      // continúa aunque el selector tarde más en aparecer; el evaluate manejará el mensaje.
    }

    // margen para que carguen tarjetas e imágenes
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const payload = await page.evaluate(() => {
      const result = {
        count: 0,
        ads: [],
        error: null,
      };

      const parent = document.getElementById('currentlistings');
      if (!parent) {
        result.error = 'No se encontró el contenedor principal (#currentlistings).';
        return result;
      }

      const grid = parent.querySelector('.d3-ads-grid.d3-ads-grid--category-list');
      if (!grid) {
        result.error = 'No se encontró el listado de avisos de Yapo.';
        return result;
      }

      const pickBestSrcsetUrl = (srcsetValue) => {
        if (!srcsetValue) return null;
        const sources = srcsetValue
          .split(',')
          .map((entry) => {
            const [rawUrl, descriptor] = entry.trim().split(/\s+/);
            if (!rawUrl) return null;
            let score = 0;
            if (descriptor?.endsWith('w')) {
              score = parseInt(descriptor, 10) || 0;
            } else if (descriptor?.endsWith('x')) {
              // multiply retina descriptors to keep them ahead of plain widths
              score = Math.round((parseFloat(descriptor) || 1) * 1000);
            }
            return { url: rawUrl, score };
          })
          .filter(Boolean)
          .sort((a, b) => b.score - a.score);
        return sources[0]?.url || null;
      };

      const normalizeImageUrl = (rawUrl) => {
        if (!rawUrl || typeof rawUrl !== 'string') return null;
        let value = rawUrl.trim();
        if (!value) return null;
        if (value.startsWith('//')) {
          value = `${window.location.protocol || 'https:'}${value}`;
        }
        try {
          const absolute = new URL(value, window.location.origin);
          const replacements = [
            ['classified-130x130', 'classified-960x720'],
            ['classified-180x135', 'classified-1024x768'],
            ['classified-250x250', 'classified-1280x960'],
            ['classified-320x240', 'classified-1280x960'],
          ];
          let normalizedHref = absolute.href;
          replacements.forEach(([needle, replacement]) => {
            if (normalizedHref.includes(needle)) {
              normalizedHref = normalizedHref.replace(needle, replacement);
            }
          });
          if (absolute.searchParams?.has('rule')) {
            const ruleValue = absolute.searchParams.get('rule');
            const match = ruleValue && ruleValue.match(/(\d+)x(\d+)/);
            if (match) {
              const width = Math.min(Number(match[1]) * 2, 1600);
              const height = Math.min(Number(match[2]) * 2, 1200);
              const upscaledRule = ruleValue.replace(/(\d+)x(\d+)/, `${width}x${height}`);
              absolute.searchParams.set('rule', upscaledRule);
              normalizedHref = absolute.toString();
            } else {
              normalizedHref = absolute.toString();
            }
          }
          return normalizedHref;
        } catch (_) {
          return value;
        }
      };

      const parsePagination = () => {
        const summary = {
          currentPage: 1,
          totalPages: 1,
          pages: [],
          hasNext: false,
          hasPrev: false,
          nextPage: null,
          prevPage: null,
        };
        const nav =
          document.querySelector('.d3-pagination') ||
          document.querySelector('[data-testid="pagination"]') ||
          document.querySelector('nav[aria-label*="pagin"]');
        if (!nav) {
          summary.pages = [1];
          return summary;
        }

        const inferPageFromHref = (href) => {
          if (!href) return null;
          try {
            const parsed = new URL(href, window.location.origin);
            const fromParam = parsed.searchParams.get('o');
            if (fromParam) {
              const parsedNumber = parseInt(fromParam, 10);
              if (!Number.isNaN(parsedNumber)) return parsedNumber;
            }
            const match = parsed.href.match(/o=(\d+)/);
            if (match) return parseInt(match[1], 10);
          } catch (_) {
            const fallbackMatch = href.match(/o=(\d+)/);
            if (fallbackMatch) return parseInt(fallbackMatch[1], 10);
          }
          return null;
        };

        const seenPages = new Set();
        const elements = Array.from(nav.querySelectorAll('a, button'));
        elements.forEach((el) => {
          const text = (el.textContent || '').trim().toLowerCase();
          const parent = el.closest('li');
          const isDisabled =
            el.hasAttribute('disabled') ||
            el.getAttribute('aria-disabled') === 'true' ||
            parent?.classList.contains('disabled');
          const isActive =
            el.getAttribute('aria-current') === 'page' ||
            parent?.classList.contains('is-active') ||
            parent?.classList.contains('active');
          const href = el.getAttribute('href') || el.dataset?.href || '';
          const pageFromHref = inferPageFromHref(href);
          const matchNumber = text.match(/\d+/);
          const pageFromText = matchNumber ? Number(matchNumber[0]) : null;
          const pageNumber = pageFromHref || pageFromText;

          if (text.includes('sig') || el.getAttribute('rel') === 'next') {
            summary.hasNext = !isDisabled;
            summary.nextPage = pageNumber || null;
            return;
          }

          if (text.includes('ant') || el.getAttribute('rel') === 'prev') {
            summary.hasPrev = !isDisabled;
            summary.prevPage = pageNumber || null;
            return;
          }

          if (pageNumber) {
            seenPages.add(pageNumber);
            if (isActive) {
              summary.currentPage = pageNumber;
            }
          }
        });

        const pages = Array.from(seenPages).sort((a, b) => a - b);
        summary.pages = pages.length ? pages : [summary.currentPage];
        const lastPage = summary.pages.length ? summary.pages[summary.pages.length - 1] : summary.currentPage;
        summary.totalPages = Math.max(summary.pages.length, lastPage || 1);

        if (!summary.nextPage && summary.hasNext) {
          const nextCandidate = summary.pages.find((value) => value > summary.currentPage);
          summary.nextPage = nextCandidate || summary.currentPage + 1;
        }

        if (!summary.prevPage && summary.hasPrev) {
          const previousCandidate = [...summary.pages].reverse().find((value) => value < summary.currentPage);
          summary.prevPage = previousCandidate || Math.max(1, summary.currentPage - 1);
        }

        return summary;
      };

      const adElements = Array.from(grid.children);
      const ads = adElements
        .map((ad) => {
          const titleEl = ad.querySelector('.d3-ad-tile__title');
          const priceEl = ad.querySelector('.d3-ad-tile__price');
          const sellerEl = ad.querySelector('.d3-ad-tile__seller span');
          const locationEl = ad.querySelector('.d3-ad-tile__location');
          const descEl = ad.querySelector('.d3-ad-tile__short-description');
          const linkEl = ad.querySelector('a.d3-ad-tile__description');
          const imgEl = ad.querySelector('.d3-ad-tile__cover img');
          const detailEls = ad.querySelectorAll('.d3-ad-tile__details-item');

          const cleanText = (node) => (node ? node.textContent.trim() : '');
          const cleanDetail = (node) => {
            if (!node) return '';
            return node.textContent.replace(/\s+/g, ' ').trim();
          };
          const extractImage = () => {
            const candidates = [];
            const registerCandidates = (value) => {
              if (value && typeof value === 'string') {
                candidates.push(value.trim());
              }
            };

            if (imgEl) {
              registerCandidates(imgEl.getAttribute('src'));
              registerCandidates(imgEl.getAttribute('data-src'));
              registerCandidates(imgEl.dataset?.src);
              registerCandidates(imgEl.currentSrc);
              if (imgEl.srcset) {
                const bestFromSrcset = pickBestSrcsetUrl(imgEl.srcset);
                registerCandidates(bestFromSrcset);
              }
            }
            const cover = ad.querySelector('.d3-ad-tile__cover');
            if (cover) {
              const bgImage = window.getComputedStyle(cover).backgroundImage;
              if (bgImage && bgImage !== 'none') {
                const match = bgImage.match(/url\((['\"]?)(.*?)\1\)/);
                if (match && match[2]) {
                  return match[2];
                }
              }
            }
            const normalized = candidates
              .map((candidate) => normalizeImageUrl(candidate))
              .find((value) => typeof value === 'string' && value.trim());
            return normalized || null;
          };

          return {
            title: cleanText(titleEl),
            price: cleanText(priceEl),
            seller: cleanText(sellerEl),
            location: cleanText(locationEl),
            description: cleanText(descEl),
            image: extractImage(),
            link: linkEl ? linkEl.href : null,
            details: Array.from(detailEls)
              .map((detail) => cleanDetail(detail))
              .filter(Boolean),
          };
        })
        .filter((ad) => ad.title);

      result.count = ads.length;
      result.ads = ads;
      result.pagination = parsePagination();
      return result;
    });

    return payload;
  } finally {
    if (!page.isClosed()) {
      await page.close();
    }
  }
};

exports.scrapeUrl = async (req, res) => {
  const { url, jobReference } = req.body || {};
  if (!url) {
    return res.status(400).json({ message: 'Debes enviar la URL a procesar.' });
  }

  try {
    const allowed = await isPublicUrl(url);
    if (!allowed) {
      return res.status(400).json({ message: 'Solo se permiten URLs públicas.' });
    }

    const jobId = enqueueScrape({
      targetUrl: url,
      jobReference: jobReference || null,
      userId: req.user?.id || null,
    });

    return res.status(202).json({ jobId });
  } catch (error) {
    console.error('Error creando job de scraping:', error);
    return res.status(500).json({ message: 'No se pudo encolar el scrape.' });
  }
};

exports.getJobs = async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT job_id AS id, job_reference, data, error, created_at FROM scraping_results ORDER BY created_at DESC LIMIT 20'
    );

    const jobs = rows.map((row) => ({
      id: row.id,
      jobReference: row.job_reference,
      createdAt: row.created_at,
      error: row.error,
      data: (() => {
        if (!row.data) return null;
        try {
          return JSON.parse(row.data);
        } catch (_) {
          return row.data;
        }
      })(),
    }));

    return res.json({ jobs });
  } catch (error) {
    console.error('Error obteniendo historial de scrapes:', error);
    return res.status(500).json({ message: 'No se pudo obtener el historial de scrapes.' });
  }
};

exports.getYapoListings = async (req, res) => {
  const limitPerPage = Math.min(normalizeNumberParam(req.query.limit, 24), 60);
  const page = normalizeNumberParam(req.query.page, 1);
  const rawPagesParam = (req.query.pages || '1').toString().trim();
  const fetchAllRequested = rawPagesParam.toLowerCase() === 'all';
  const requestedBatchSize = fetchAllRequested ? MAX_PAGE_BATCH : normalizeNumberParam(rawPagesParam, 1);
  const search = (req.query.search || '').trim();
  const region = DEFAULT_REGION;
  const category = DEFAULT_CATEGORY;
  const forcedWarnings = [];
  const jobReference = req.query.jobReference || 'direct:yapo-listings';
  const userProvidedUrl = Boolean(req.query.url);
  const multiPageAllowed = !userProvidedUrl;

  if (req.query.region && req.query.region.toLowerCase() !== DEFAULT_REGION) {
    forcedWarnings.push('Solo se muestran inmuebles ubicados en la Región del Maule.');
  }

  if (req.query.category && req.query.category.toLowerCase() !== DEFAULT_CATEGORY) {
    forcedWarnings.push('Solo se muestra la categoría de inmuebles en esta vista.');
  }

  if (!multiPageAllowed && (fetchAllRequested || requestedBatchSize > 1)) {
    forcedWarnings.push('El modo multi página solo está disponible usando la URL predeterminada.');
  }

  let targetUrl = req.query.url;
  if (targetUrl) {
    try {
      targetUrl = assertYapoUrl(targetUrl);
    } catch (error) {
      return res.status(400).json({ message: error.message || 'URL inválida.' });
    }
  } else {
    targetUrl = buildYapoUrl({ region, category, search, page });
  }

  try {
    const aggregatedListings = [];
    const aggregatedWarnings = [];
    const visitedPages = new Set();
    let paginationSummary = null;

    const fetchAndAggregatePage = async (pageNumber, explicitUrl = null) => {
      const sanitizedPage = sanitizePageNumber(pageNumber) || 1;
      const urlForPage = explicitUrl || buildYapoUrl({ region, category, search, page: sanitizedPage });
      const pageResult = await scrapeYapoPage(urlForPage);
      const prioritized = prioritizeListings(pageResult.ads || []);
      aggregatedListings.push(...attachSourcePage(prioritized, sanitizedPage));
      if (pageResult.error) {
        aggregatedWarnings.push(pageResult.error);
      }
      paginationSummary = paginationSummary
        ? mergePaginationSummaries(paginationSummary, pageResult.pagination, sanitizedPage)
        : buildPaginationSummary(pageResult.pagination, sanitizedPage);
      visitedPages.add(sanitizedPage);
    };

    await fetchAndAggregatePage(page, targetUrl);

    const effectiveFetchAll = multiPageAllowed && fetchAllRequested;
    const effectiveBatchSize = multiPageAllowed ? Math.min(requestedBatchSize, MAX_PAGE_BATCH) : 1;
    const maxPagesToVisit = effectiveFetchAll ? MAX_PAGE_BATCH : Math.max(1, effectiveBatchSize);
    const queue = [];

    if (multiPageAllowed) {
      if (effectiveFetchAll) {
        const remaining = (paginationSummary?.pages || []).filter((value) => value !== page);
        enqueuePages(remaining, queue, visitedPages);
      } else if (maxPagesToVisit > 1) {
        const sequential = Array.from({ length: maxPagesToVisit - 1 }, (_, index) => page + index + 1);
        enqueuePages(sequential, queue, visitedPages);
      }
    }

    while (queue.length && visitedPages.size < maxPagesToVisit) {
      const nextPageNumber = queue.shift();
      if (!nextPageNumber) continue;
      if (paginationSummary?.totalPages && nextPageNumber > paginationSummary.totalPages && !effectiveFetchAll) {
        continue;
      }
      await fetchAndAggregatePage(nextPageNumber);
      if (effectiveFetchAll) {
        const newCandidates = (paginationSummary?.pages || []).filter((value) => !visitedPages.has(value));
        enqueuePages(newCandidates, queue, visitedPages);
      }
    }

    if (effectiveFetchAll && visitedPages.size === MAX_PAGE_BATCH && (paginationSummary?.pages?.length || 0) > visitedPages.size) {
      aggregatedWarnings.push(`Se limitaron los scrapeos a ${MAX_PAGE_BATCH} páginas para proteger el servicio.`);
    }

    const visitedPagesArray = uniqueSortedPages([...visitedPages]);
    paginationSummary = paginationSummary
      ? { ...paginationSummary, fetchedPages: visitedPagesArray }
      : buildPaginationSummary(null, page);

    const totalListings = aggregatedListings.length;
    const returnAllListings = effectiveFetchAll || (multiPageAllowed && maxPagesToVisit > 1);
    const effectiveLimit = returnAllListings ? totalListings : Math.min(limitPerPage, totalListings);
    const listings = aggregatedListings.slice(0, effectiveLimit);
    const warnings = Array.from(new Set([...forcedWarnings, ...aggregatedWarnings]));

    const responsePayload = {
      meta: {
        total: totalListings,
        limit: effectiveLimit,
        perPageLimit: limitPerPage,
        page,
        pagesRequested: fetchAllRequested ? 'all' : requestedBatchSize,
        pagesApplied: paginationSummary.fetchedPages.length,
        pagesFetched: paginationSummary.fetchedPages,
        totalPages: paginationSummary.totalPages,
        availablePages: paginationSummary.pages,
        fetchMode: effectiveFetchAll ? 'all' : maxPagesToVisit > 1 ? 'batch' : 'single',
        targetUrl,
        region,
        category,
        search,
        multiPageAllowed,
      },
      pagination: paginationSummary,
      listings,
      warnings,
    };

    await persistScrapeResult({ data: responsePayload, jobReference });

    return res.json(responsePayload);
  } catch (error) {
    console.error('Error durante scraping de Yapo:', error);
    await persistScrapeResult({
      data: {
        meta: { targetUrl, region, category, search, page, limit: limitPerPage, pagesRequested: rawPagesParam },
        listings: [],
      },
      jobReference,
      error: error.message || 'Error desconocido durante el scraping',
    });
    return res.status(500).json({ message: 'No se pudo obtener información de Yapo.cl' });
  }
};
