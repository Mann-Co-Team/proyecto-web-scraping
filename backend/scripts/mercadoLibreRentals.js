#!/usr/bin/env node
/**
 * Mercado Libre API helper focused on rental listings.
 *
 * Run with Node.js 18+ (native fetch support). Example:
 *   cd backend && node scripts/mercadoLibreRentals.js
 *
 * The script keeps the logic isolated so you can import the exported functions
 * (searchRentals, getItemDetails, getSellerProfile) from other services.
 */

const BASE_URL = 'https://api.mercadolibre.com';
const DEFAULT_SITE_ID = process.env.ML_SITE_ID || 'MLC'; // MLC: Chile
const RENT_OPERATION_ID = '242075'; // Mercado Libre attribute value for "Arriendo"
const CATEGORY_INMUEBLES_MLC = 'MLC1692';
const PROPERTY_TYPE_DEPARTAMENTO = '242062';
const PROPERTY_TYPE_CASA = '242063';
const MAX_LIMIT = 50; // API enforces limit <= 50 and offset+limit <= 1050

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (input, init = {}) => {
  const response = await fetch(input, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'proyecto-web-scraping/mercado-libre-helper',
      ...(init.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mercado Libre API error (${response.status}): ${body}`);
  }

  return response.json();
};

const extractAttribute = (entity, attrId) => {
  const attrs = entity?.attributes || entity?.item_attributes || [];
  const match = attrs.find((attr) => attr.id === attrId || attr.name === attrId);
  return match?.value_name || match?.values?.[0]?.name || null;
};

const buildSearchUrl = (filters = {}) => {
  const {
    siteId = DEFAULT_SITE_ID,
    query = '',
    categoryId = CATEGORY_INMUEBLES_MLC,
    limit = 30,
    offset = 0,
    operationId = RENT_OPERATION_ID,
    propertyTypeId = PROPERTY_TYPE_DEPARTAMENTO,
    stateId,
    cityId,
    priceRange,
    bedrooms,
    bathrooms,
    sort = 'price_asc',
  } = filters;

  const url = new URL(`${BASE_URL}/sites/${siteId}/search`);
  url.searchParams.set('limit', String(Math.min(limit, MAX_LIMIT)));
  url.searchParams.set('offset', String(offset));
  if (categoryId) url.searchParams.set('category', categoryId);
  if (query) url.searchParams.set('q', query);
  if (operationId) url.searchParams.set('OPERATION', operationId);
  if (propertyTypeId) url.searchParams.set('PROPERTY_TYPE', propertyTypeId);
  if (stateId) url.searchParams.set('state', stateId);
  if (cityId) url.searchParams.set('city', cityId);
  if (priceRange && priceRange.length === 2) {
    url.searchParams.set('price', `${priceRange[0]}-${priceRange[1]}`);
  }
  if (bedrooms) url.searchParams.set('ROOMS', bedrooms);
  if (bathrooms) url.searchParams.set('BATHROOMS', bathrooms);
  if (sort) url.searchParams.set('sort', sort);

  return url;
};

const summarizeListing = (listing) => ({
  id: listing.id,
  title: listing.title,
  price: listing.price,
  currency: listing.currency_id,
  permalink: listing.permalink,
  sellerId: listing.seller?.id || null,
  location: listing.address || listing.location || null,
  operation: extractAttribute(listing, 'OPERATION'),
  propertyType: extractAttribute(listing, 'PROPERTY_TYPE'),
  rooms: extractAttribute(listing, 'ROOMS'),
  bathrooms: extractAttribute(listing, 'BATHROOMS'),
});

const searchRentals = async (filters = {}) => {
  const url = buildSearchUrl(filters);
  const payload = await fetchJson(url);

  return {
    requestUrl: url.toString(),
    paging: payload.paging,
    availableFilters: payload.available_filters,
    results: payload.results.map(summarizeListing),
  };
};

const getItemDetails = async (itemId) => {
  if (!itemId) throw new Error('itemId es obligatorio');
  return fetchJson(`${BASE_URL}/items/${itemId}`);
};

const getItemDescription = async (itemId) => {
  if (!itemId) throw new Error('itemId es obligatorio');
  return fetchJson(`${BASE_URL}/items/${itemId}/description`);
};

const getSellerProfile = async (sellerId) => {
  if (!sellerId) throw new Error('sellerId es obligatorio');
  return fetchJson(`${BASE_URL}/users/${sellerId}`);
};

const logListingSummary = (listing, index) => {
  const locationParts = [listing.location?.city_name, listing.location?.state_name]
    .filter(Boolean)
    .join(', ');
  console.log(
    `${index + 1}. ${listing.title} | ${listing.price} ${listing.currency} | ${listing.operation || 'Operación desconocida'} | ${listing.propertyType || 'Tipo N/D'} | ${locationParts}`
  );
};

const runDemo = async () => {
  const demoFilters = {
    query: 'departamento talca',
    priceRange: [200000, 600000],
    bedrooms: '2-3',
    bathrooms: '1-2',
    stateId: 'CL-MA', // Región del Maule
    propertyTypeId: PROPERTY_TYPE_DEPARTAMENTO,
    operationId: RENT_OPERATION_ID,
    limit: 10,
  };

  console.log('> Buscando arriendos con filtros:', demoFilters);
  const search = await searchRentals(demoFilters);
  console.log(`> Endpoint invocado: ${search.requestUrl}`);
  console.log(`> Resultados recibidos: ${search.results.length} de ${search.paging.total}`);

  if (!search.results.length) {
    console.log('No se encontraron arriendos con los filtros dados.');
    return;
  }

  search.results.forEach((listing, idx) => logListingSummary(listing, idx));

  const focus = search.results[0];
  console.log('\n> Consultando detalle del primer aviso:', focus.id);
  const itemDetails = await getItemDetails(focus.id);
  await delay(300); // Respeta límites de rate limit (~20 req/s)
  const sellerProfile = focus.sellerId ? await getSellerProfile(focus.sellerId) : null;
  let description = null;
  try {
    description = await getItemDescription(focus.id);
  } catch (err) {
    console.warn('No se pudo obtener la descripción larga:', err.message);
  }

  const keyFields = {
    id: itemDetails.id,
    title: itemDetails.title,
    price: itemDetails.price,
    currency: itemDetails.currency_id,
    available_quantity: itemDetails.available_quantity,
    listing_type_id: itemDetails.listing_type_id,
    operation: extractAttribute(itemDetails, 'OPERATION') || focus.operation,
    propertyType: extractAttribute(itemDetails, 'PROPERTY_TYPE') || focus.propertyType,
    rooms: extractAttribute(itemDetails, 'ROOMS') || focus.rooms,
    bathrooms: extractAttribute(itemDetails, 'BATHROOMS') || focus.bathrooms,
    totalArea: extractAttribute(itemDetails, 'TOTAL_AREA'),
    coveredArea: extractAttribute(itemDetails, 'COVERED_AREA'),
    location: itemDetails.location,
    permalink: itemDetails.permalink,
  };

  console.log('Detalle del aviso:', keyFields);
  if (description?.plain_text) {
    console.log('Descripción (primeros 140 chars):', description.plain_text.slice(0, 140));
  }

  if (sellerProfile) {
    console.log('\n> Perfil del vendedor/inmobiliaria:');
    console.log({
      id: sellerProfile.id,
      nickname: sellerProfile.nickname,
      registration_date: sellerProfile.registration_date,
      tags: sellerProfile.tags,
      seller_reputation: sellerProfile.seller_reputation,
      address: sellerProfile.address,
    });
  }

  console.log('\n> Recuerda que offset + limit no puede exceder 1050. Pagina usando search.paging.');
};

if (require.main === module) {
  runDemo().catch((error) => {
    console.error('Error ejecutando el demo de Mercado Libre:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildSearchUrl,
  searchRentals,
  getItemDetails,
  getItemDescription,
  getSellerProfile,
  constants: {
    BASE_URL,
    DEFAULT_SITE_ID,
    RENT_OPERATION_ID,
    CATEGORY_INMUEBLES_MLC,
    PROPERTY_TYPE_DEPARTAMENTO,
    PROPERTY_TYPE_CASA,
  },
};
