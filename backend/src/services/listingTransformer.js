const crypto = require('crypto');

const UF_TO_CLP_RATE = Number(process.env.UF_TO_CLP_RATE || 37000);

const RENT_KEYWORDS = ['arriendo', 'arrienda', 'arriende', 'arrendar', 'arriendo mensual', 'se arrienda', 'arriendo casa', 'arriendo depto'];
const SALE_KEYWORDS = ['venta', 'vende', 'vendo', 'se vende', 'en venta', 'compraventa', 'propiedad en venta'];
const PROPERTY_TYPE_KEYWORDS = {
  casa: [' casa', 'casas', 'casa ', 'casa,'],
  departamento: ['departamento', 'depto', 'dept.', 'departamento'],
  parcela: ['parcela', 'terreno', 'sitio', 'campo'],
  oficina: ['oficina', 'local', 'comercial'],
  habitacion: ['habitación', 'habitacion', 'pieza'],
  bodega: ['bodega', 'galpón', 'galpon'],
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

const extractUfNumericValue = (priceText) => {
  if (!priceText || !/uf/i.test(priceText)) return null;
  const normalized = priceText
    .toLowerCase()
    .replace(/[^0-9,\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(/(\d+(?:[\.,]\d+)?)/);
  if (!match) return null;
  const numeric = match[1].replace(/\./g, '').replace(',', '.');
  const value = Number(numeric);
  return Number.isFinite(value) ? value : null;
};

const parsePriceToNumber = (priceText) => {
  if (!priceText) return null;
  const ufValue = extractUfNumericValue(priceText);
  if (ufValue !== null) {
    return Math.round(ufValue * UF_TO_CLP_RATE);
  }
  const digits = priceText.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
};

const extractExternalId = (ad = {}, pageNumber = 0) => {
  if (ad.link) {
    const link = String(ad.link);
    const fromQuery = link.match(/id=(\d+)/i);
    if (fromQuery) return fromQuery[1];
    const numericSlug = link.match(/(\d{5,})/);
    if (numericSlug) return numericSlug[1];
  }
  const fallback = `${ad.title || ''}|${ad.location || ''}|${ad.price || ''}|${pageNumber}`
    .toLowerCase()
    .trim();
  return crypto.createHash('sha1').update(fallback).digest('hex');
};

const detectPropertyType = (ad = {}) => {
  const haystack = `${ad.title || ''} ${ad.description || ''}`.toLowerCase();
  const entries = Object.entries(PROPERTY_TYPE_KEYWORDS);
  for (const [type, keywords] of entries) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return type;
    }
  }
  return null;
};

const extractBedroomsCount = (ad = {}) => {
  const text = `${ad.title || ''} ${ad.description || ''}`.toLowerCase();
  const match = text.match(/(\d+)\s*(?:dorm|habitaci|pieza|cuarto)/);
  if (match) {
    return Number(match[1]);
  }
  if (Array.isArray(ad.details)) {
    for (const detail of ad.details) {
      const detailMatch = String(detail).toLowerCase().match(/(\d+)\s*(?:dorm|habitaci|pieza|cuarto)/);
      if (detailMatch) {
        return Number(detailMatch[1]);
      }
    }
  }
  return null;
};

const normalizeListingForStorage = (ad = {}, { pageNumber = 1 } = {}) => {
  const details = Array.isArray(ad.details) ? ad.details.filter(Boolean) : [];
  const resolvedSource = ad.source || ad.provider || 'yapo';
  return {
    externalId: extractExternalId(ad, pageNumber),
    title: ad.title || 'Sin título',
    description: ad.description || '',
    priceLabel: ad.price || null,
    priceNumeric: parsePriceToNumber(ad.price),
    location: ad.location || null,
    seller: ad.seller || null,
    propertyType: detectPropertyType(ad),
    bedroomCount: extractBedroomsCount(ad),
    transactionType: detectTransactionType(ad),
    link: ad.link || null,
    image: ad.image || null,
    details,
    raw: {
      ...ad,
      source: resolvedSource,
      sourcePage: pageNumber,
    },
    pageNumber,
  };
};

const normalizeListingFilters = (filters = {}) => {
  const toPositiveNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const parsed = {
    propertyType: (filters.propertyType || '').toLowerCase(),
    location: (filters.location || '').toLowerCase(),
    bedrooms: Array.isArray(filters.bedrooms)
      ? filters.bedrooms
      : typeof filters.bedrooms === 'string'
        ? filters.bedrooms.split(',').map((value) => value.trim()).filter(Boolean)
        : [],
    minPrice: toPositiveNumber(filters.minPrice),
    maxPrice: toPositiveNumber(filters.maxPrice),
    transaction: (filters.transaction || '').toLowerCase(),
    searchTerm: (filters.searchTerm || '').toLowerCase(),
  };

  if (parsed.minPrice !== null && parsed.maxPrice !== null && parsed.minPrice > parsed.maxPrice) {
    const tmp = parsed.minPrice;
    parsed.minPrice = parsed.maxPrice;
    parsed.maxPrice = tmp;
  }

  parsed.hasFilters = Boolean(
    parsed.propertyType ||
      parsed.location ||
      parsed.bedrooms.length ||
      parsed.minPrice !== null ||
      parsed.maxPrice !== null ||
      parsed.transaction ||
      parsed.searchTerm
  );
  return parsed;
};

module.exports = {
  detectTransactionType,
  normalizeListingForStorage,
  normalizeListingFilters,
  parsePriceToNumber,
};
