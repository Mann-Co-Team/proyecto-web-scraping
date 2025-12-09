const { URL } = require('url');
const { initPuppeteer } = require('./puppeteerService');

const DEFAULT_REGION = 'maule';
const DEFAULT_CATEGORY = 'inmuebles';
const DEFAULT_URL = 'https://www.yapo.cl/searchresult/bienes-raices?regionslug=maule&ca=15_s&w=1&ret=2&cmn=1&cm=1';
const ALLOWED_HOSTS = ['yapo.cl', 'www.yapo.cl'];

const CATEGORY_SEARCH_SLUGS = {
  inmuebles: 'bienes-raices',
  'bienes-raices': 'bienes-raices',
};

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

const resolveCategorySearchSlug = (category = DEFAULT_CATEGORY) => {
  const normalized = String(category || '').trim().toLowerCase();
  return CATEGORY_SEARCH_SLUGS[normalized] || normalized || CATEGORY_SEARCH_SLUGS[DEFAULT_CATEGORY];
};

const buildYapoUrl = ({
  region = DEFAULT_REGION,
  category = DEFAULT_CATEGORY,
  search = '',
  page = 1,
}) => {
  try {
    const sanitizedPage = sanitizePageNumber(page) || 1;
    const regionSlug = String(region || DEFAULT_REGION).trim().toLowerCase() || DEFAULT_REGION;
    const searchSlug = resolveCategorySearchSlug(category);
    const pageSuffix = sanitizedPage > 1 ? `.${sanitizedPage}` : '';
    const baseUrl = `https://www.yapo.cl/searchresult/${searchSlug}${pageSuffix}`;
    const url = new URL(baseUrl);
    url.searchParams.set('regionslug', regionSlug);
    url.searchParams.set('ca', '15_s');
    url.searchParams.set('w', '1');
    url.searchParams.set('ret', '2');
    url.searchParams.set('cmn', '1');
    url.searchParams.set('cm', '1');
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
            const registerSrcset = (value) => {
              if (!value) return;
              const best = pickBestSrcsetUrl(value);
              if (best) {
                registerCandidates(best);
              }
            };

            if (imgEl) {
              registerCandidates(imgEl.getAttribute('src'));
              registerCandidates(imgEl.getAttribute('data-src'));
              registerCandidates(imgEl.dataset?.src);
              registerCandidates(imgEl.currentSrc);
              registerSrcset(imgEl.getAttribute('srcset'));
              registerSrcset(imgEl.getAttribute('data-srcset'));
            }

            const picture = imgEl?.closest('picture');
            if (picture) {
              const sources = picture.querySelectorAll('source');
              sources.forEach((source) => {
                registerSrcset(source.getAttribute('srcset'));
                registerSrcset(source.getAttribute('data-srcset'));
              });
            }
            const cover = ad.querySelector('.d3-ad-tile__cover');
            if (cover) {
              const bgImage = window.getComputedStyle(cover).backgroundImage;
              if (bgImage && bgImage !== 'none') {
                const match = bgImage.match(/url\((['\"]?)(.*?)\1\)/);
                if (match && match[2]) {
                  registerCandidates(match[2]);
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

module.exports = {
  DEFAULT_REGION,
  DEFAULT_CATEGORY,
  DEFAULT_URL,
  sanitizePageNumber,
  uniqueSortedPages,
  buildYapoUrl,
  assertYapoUrl,
  buildPaginationSummary,
  scrapeYapoPage,
};
