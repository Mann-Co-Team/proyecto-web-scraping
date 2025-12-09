const crypto = require('crypto');
const { initPuppeteer } = require('./puppeteerService');
const { parsePriceToNumber } = require('./listingTransformer');

const BASE_URL = 'https://listado.mercadolibre.cl';
const DEFAULT_QUERY = 'departamento talca arriendo';
const SOURCE_KEY = 'mercadolibre';
const SOURCE_LABEL = 'Mercado Libre';
const PROPERTY_PATTERNS = [
  { key: 'departamento', needles: ['departamento', 'depto', 'dept.'] },
  { key: 'casa', needles: [' casa', 'casa ', 'casas', 'casa,'] },
  { key: 'parcela', needles: ['parcela', 'terreno', 'sitio'] },
  { key: 'oficina', needles: ['oficina', 'local', 'comercial'] },
  { key: 'habitacion', needles: ['habitacion', 'habitación', 'pieza'] },
];

const slugify = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

const detectPropertyTypeFromText = (text = '') => {
  const normalized = text.toLowerCase();
  for (const entry of PROPERTY_PATTERNS) {
    if (entry.needles.some((needle) => normalized.includes(needle.trim().toLowerCase()))) {
      return entry.key;
    }
  }
  return null;
};

const extractBedroomsFromText = (text = '') => {
  const match = text.toLowerCase().match(/(\d+)\s*(?:dorm|habitaci|pieza|hab\.)/);
  return match ? Number(match[1]) : null;
};

const normalizeLink = (href) => {
  if (!href) return null;
  try {
    const parsed = new URL(href);
    parsed.hash = '';
    return parsed.toString();
  } catch (_) {
    return href;
  }
};

const normalizeRawId = (rawId) => {
  if (!rawId) return null;
  const cleaned = rawId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (cleaned.startsWith('MLC')) {
    return cleaned;
  }
  if (cleaned) {
    return `MLC${cleaned}`;
  }
  return null;
};

const buildListingId = (rawId) => {
  const normalized = normalizeRawId(rawId);
  if (normalized) {
    return `ml-${normalized}`;
  }
  const fallback = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex');
  return `ml-fallback-${fallback}`;
};

const normalizeWords = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

const resolvePropertyKeyword = (propertyType) => {
  if (!propertyType) return null;
  const match = PROPERTY_PATTERNS.find((entry) => entry.key === propertyType);
  if (match) {
    return match.needles[0] || propertyType;
  }
  return propertyType;
};

const buildSearchSlugTokens = ({ query, location, propertyType } = {}) => {
  const orderedTokens = [];
  const seen = new Set();
  const pushTokens = (value) => {
    normalizeWords(value).forEach((token) => {
      if (!seen.has(token)) {
        seen.add(token);
        orderedTokens.push(token);
      }
    });
  };

  const propertyKeyword = resolvePropertyKeyword(propertyType);
  if (propertyKeyword) {
    pushTokens(propertyKeyword);
  }

  if (location) {
    pushTokens(location);
  }

  if (query) {
    pushTokens(query);
  }

  if (!orderedTokens.length) {
    pushTokens(DEFAULT_QUERY);
  }

  if (!seen.has('talca')) {
    pushTokens('talca');
  }

  if (!seen.has('arriendo')) {
    pushTokens('arriendo');
  }

  return orderedTokens;
};

const buildSearchUrl = ({ query, location, stateId, propertyType } = {}) => {
  const tokens = buildSearchSlugTokens({ query, location, propertyType });
  const slug = slugify(tokens.join(' ')) || slugify(DEFAULT_QUERY);
  const target = `${BASE_URL}/${slug}`;
  const url = new URL(target);
  if (stateId) {
    url.searchParams.set('state', stateId);
  }
  url.searchParams.set('since', 'today');
  return url.toString();
};

const formatFallbackListing = (card, requestUrl) => {
  const joinedDetails = card.details.join(' ');
  return {
    id: buildListingId(card.rawId),
    title: card.title,
    description: 'Publicación obtenida desde Mercado Libre (modo fallback).',
    price: card.priceLabel || 'Precio no informado',
    priceNumeric: parsePriceToNumber(card.priceLabel || ''),
    location: card.location || null,
    seller: card.seller || SOURCE_LABEL,
    transactionType: 'rent',
    propertyType: detectPropertyTypeFromText(`${card.title} ${joinedDetails}`),
    bedroomCount: extractBedroomsFromText(`${card.title} ${joinedDetails}`),
    link: normalizeLink(card.link),
    image: card.image || null,
    details: card.details,
    sourcePage: requestUrl,
    source: SOURCE_KEY,
    sourceLabel: SOURCE_LABEL,
    raw: {
      source: SOURCE_KEY,
      id: card.rawId || null,
      fallback: true,
    },
  };
};

const evaluateListingsFromPage = async (page, limit) =>
  page.evaluate((maxItems) => {
    const normalizeText = (value) => (value ? value.replace(/\s+/g, ' ').trim() : '');
    const pickImage = (imgEl) => {
      if (!imgEl) return null;
      return (
        imgEl.getAttribute('data-src') ||
        imgEl.getAttribute('src') ||
        imgEl.currentSrc ||
        null
      );
    };

    const seen = new Set();
    const nodes = Array.from(document.querySelectorAll('li.ui-search-layout__item'));
    const collected = [];
    for (const node of nodes) {
      if (collected.length >= maxItems) break;
      const wrapper = node.querySelector('.ui-search-result__wrapper') || node;
      const linkEl = wrapper.querySelector('a.ui-search-link');
      const titleEl = wrapper.querySelector('h2.ui-search-item__title');
      if (!linkEl || !titleEl) {
        continue;
      }
      const rawLink = linkEl.href;
      if (!rawLink || seen.has(rawLink)) {
        continue;
      }
      seen.add(rawLink);
      const priceContainer =
        wrapper.querySelector('.ui-search-price__second-line') ||
        wrapper.querySelector('.ui-search-item__price') ||
        wrapper.querySelector('.andes-money-amount__fraction');
      const locationEl =
        wrapper.querySelector('.ui-search-item__group__element--location') ||
        wrapper.querySelector('.ui-search-item__location');
      const attributeEls = wrapper.querySelectorAll('.ui-search-card-attributes__attribute');
      const sellerEl =
        wrapper.querySelector('.ui-search-official-store-label') ||
        wrapper.querySelector('.ui-search-item__group__element--seller');
      const imageEl =
        wrapper.querySelector('img.ui-search-result-image__element') ||
        wrapper.querySelector('img');

      const priceLabel = normalizeText(priceContainer?.textContent) || 'Precio no informado';
      const details = Array.from(attributeEls)
        .map((element) => normalizeText(element.textContent))
        .filter(Boolean);

      const idMatch = rawLink.match(/MLC-?\d+/i);

      collected.push({
        rawId: idMatch ? idMatch[0].replace(/-/g, '').toUpperCase() : rawLink,
        title: normalizeText(titleEl.textContent),
        priceLabel,
        location: normalizeText(locationEl?.textContent),
        link: rawLink,
        image: pickImage(imageEl),
        details,
        seller: normalizeText(sellerEl?.textContent),
      });
    }
    return collected;
  }, limit);

const scrapeMercadoLibreFallback = async (filters = {}, options = {}) => {
  const limit = Math.max(1, Math.min(Number(options.limit) || 8, 24));
  const targetUrl = buildSearchUrl(filters);
  const browser = await initPuppeteer();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('li.ui-search-layout__item', { timeout: 20_000 }).catch(() => {});
    const rawListings = await evaluateListingsFromPage(page, limit);
    const listings = rawListings.map((card) => formatFallbackListing(card, targetUrl));
    return {
      listings,
      total: listings.length,
      requestUrl: targetUrl,
      fallback: true,
    };
  } finally {
    if (!page.isClosed()) {
      await page.close();
    }
  }
};

module.exports = {
  scrapeMercadoLibreFallback,
};
