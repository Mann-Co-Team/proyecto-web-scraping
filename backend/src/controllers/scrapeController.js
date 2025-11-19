const { URL } = require('url');
const crypto = require('crypto');
const pool = require('../config/db');
const { enqueueScrape, isPublicUrl } = require('../queues/scrapeQueue');
const { initPuppeteer } = require('../services/puppeteerService');

const DEFAULT_REGION = 'maule';
const DEFAULT_CATEGORY = 'inmuebles';
const DEFAULT_URL = 'https://www.yapo.cl/maule/inmuebles?ca=15_s&o=1&w=1&ret=2&cmn=1&cm=1';
const ALLOWED_HOSTS = ['yapo.cl', 'www.yapo.cl'];

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

          const cleanText = (node) => (node ? node.textContent.trim() : '');

          return {
            title: cleanText(titleEl),
            price: cleanText(priceEl),
            seller: cleanText(sellerEl),
            location: cleanText(locationEl),
            description: cleanText(descEl),
            image: imgEl ? imgEl.src : null,
            link: linkEl ? linkEl.href : null,
          };
        })
        .filter((ad) => ad.title);

      result.count = ads.length;
      result.ads = ads;
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
  const limit = Math.min(normalizeNumberParam(req.query.limit, 24), 60);
  const page = normalizeNumberParam(req.query.page, 1);
  const search = (req.query.search || '').trim();
  const region = DEFAULT_REGION;
  const category = DEFAULT_CATEGORY;
  const forcedWarnings = [];
  const jobReference = req.query.jobReference || 'direct:yapo-listings';

  if (req.query.region && req.query.region.toLowerCase() !== DEFAULT_REGION) {
    forcedWarnings.push('Solo se muestran inmuebles ubicados en la Región del Maule.');
  }

  if (req.query.category && req.query.category.toLowerCase() !== DEFAULT_CATEGORY) {
    forcedWarnings.push('Solo se muestra la categoría de inmuebles en esta vista.');
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
    const result = await scrapeYapoPage(targetUrl);
    const gatheredWarnings = result.error ? [result.error] : [];
    const responsePayload = {
      meta: {
        total: result.count,
        limit,
        page,
        targetUrl,
        region,
        category,
        search,
      },
      listings: result.ads.slice(0, limit),
      warnings: [...forcedWarnings, ...gatheredWarnings],
    };

    // persist result for history/auditing
    await persistScrapeResult({ data: responsePayload, jobReference });

    return res.json(responsePayload);
  } catch (error) {
    console.error('Error durante scraping de Yapo:', error);
    await persistScrapeResult({
      data: {
        meta: { targetUrl, region, category, search, page, limit },
        listings: [],
      },
      jobReference,
      error: error.message || 'Error desconocido durante el scraping',
    });
    return res.status(500).json({ message: 'No se pudo obtener información de Yapo.cl' });
  }
};
