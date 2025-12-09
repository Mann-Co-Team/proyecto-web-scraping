const pool = require('../config/db');
const {
	enqueueScrape,
	enqueueRunPageJob,
	isPublicUrl,
} = require('../queues/scrapeQueue');
const {
	DEFAULT_REGION,
	DEFAULT_CATEGORY,
	assertYapoUrl,
} = require('../services/yapoScraper');
const { scrapeMercadoLibreFallback } = require('../services/mercadoLibreFallbackScraper');
const {
	buildCacheKey: buildMercadoLibreCacheKey,
	getCachedListings: getCachedMercadoLibreListings,
	setCachedListings: setCachedMercadoLibreListings,
} = require('../services/mercadoLibreCache');
const {
	getCachedRunListings: getCachedYapoListings,
	setCachedRunListings,
} = require('../services/yapoListingsCache');
const {
	MAX_RUN_PAGES,
	getRunById,
	findReusableRun,
	findLastCompletedRun,
	createRun,
	addRunPages,
	getRunProgress,
	fetchAllListingsForRun,
} = require('../services/runStorageService');
const { normalizeListingFilters } = require('../services/listingTransformer');
const {
	searchRentals: searchMercadoLibreRentals,
	getItemDetails: getMercadoLibreItemDetails,
} = require('../services/mercadoLibreRentals');

const SOURCE_LABELS = {
	yapo: 'Yapo.cl',
	mercadolibre: 'Mercado Libre',
};

const resolveListingSource = (listing = {}) => {
	const rawValue =
		listing?.raw?.source ??
		listing?.source ??
		listing?.raw?.provider ??
		listing?.provider ??
		listing?.raw?.origin ??
		listing?.origin ??
		'';
	const normalized = String(rawValue || '').toLowerCase();
	if (normalized.includes('mercado')) {
		return { key: 'mercadolibre', label: SOURCE_LABELS.mercadolibre };
	}
	if (normalized.includes('yapo')) {
		return { key: 'yapo', label: SOURCE_LABELS.yapo };
	}
	if (SOURCE_LABELS[normalized]) {
		return { key: normalized, label: SOURCE_LABELS[normalized] };
	}
	if (rawValue) {
		return {
			key: normalized || 'otras',
			label: listing?.raw?.sourceLabel || listing?.sourceLabel || String(rawValue),
		};
	}
	return { key: 'yapo', label: SOURCE_LABELS.yapo };
};

const resolveMercadoLibreMode = (pack = {}) => {
	if (pack.usedFallback) return 'html-fallback';
	if (pack.usedCache) return 'cache';
	return 'api';
};

const clamp = (value, min, max) => {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return min;
	return Math.min(Math.max(numeric, min), max);
};

const FIXED_PAGE_SIZE = 9;
const DEFAULT_RUN_PAGES = Math.min(
	Math.max(Number(process.env.SCRAPE_RUN_DEFAULT_PAGES) || MAX_RUN_PAGES, 1),
	MAX_RUN_PAGES
);
const FALLBACK_MESSAGE = 'Estamos construyendo resultados frescos. Intenta nuevamente en unos minutos.';
const MERCADO_LIBRE_MAX_LIMIT = 20;
const MERCADO_LIBRE_DEFAULT_LIMIT = Math.min(
	Math.max(Number(process.env.ML_LISTINGS_LIMIT) || 8, 1),
	MERCADO_LIBRE_MAX_LIMIT
);
const MERCADO_LIBRE_DETAIL_DELAY_MS = Number(process.env.ML_DETAIL_DELAY_MS) || 120;
const MERCADO_LIBRE_DETAIL_CONCURRENCY = Math.min(
	Math.max(Number(process.env.ML_DETAIL_CONCURRENCY) || 3, 1),
	6
);
const MERCADO_LIBRE_DETAIL_TIME_BUDGET_MS = Math.min(
	Math.max(Number(process.env.ML_DETAIL_TIME_BUDGET_MS) || 6000, 1000),
	20000
);
const MERCADO_LIBRE_DETAIL_WARNING =
	'Limitamos el detalle de Mercado Libre para responder antes de 10 segundos. Abre la ficha para ver toda la informaciÃ³n.';
const MERCADO_LIBRE_CACHE_FETCH_MIN_LIMIT = clamp(
	Number(process.env.ML_CACHE_FETCH_MIN_LIMIT) || 18,
	MERCADO_LIBRE_DEFAULT_LIMIT,
	MERCADO_LIBRE_MAX_LIMIT
);
const MERCADO_LIBRE_CACHE_WARNING =
	'Aplicamos los filtros sobre resultados recientes para responder mÃ¡s rÃ¡pido. Actualiza en unos minutos para refrescar la data.';
const YAPO_CACHE_WARNING =
	'Aplicamos los filtros con los datos scrapeados recientemente de Yapo para responder al instante. Usa "Actualizar" si necesitas forzar un nuevo scrape.';

const parsePagesParam = (raw) => {
	if (raw === undefined || raw === null || raw === '') {
		return DEFAULT_RUN_PAGES;
	}
	if (typeof raw === 'string') {
		const normalized = raw.trim().toLowerCase();
		if (!normalized) {
			return DEFAULT_RUN_PAGES;
		}
		if (normalized === 'all') {
			return MAX_RUN_PAGES;
		}
	}
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RUN_PAGES;
	return Math.min(parsed, MAX_RUN_PAGES);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatCurrencyLabel = (value, currency = 'CLP') => {
	if (!Number.isFinite(value)) return null;
	try {
		return new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(value);
	} catch (error) {
		return `${currency} ${value.toLocaleString('es-CL')}`;
	}
};

const pickAttributeValue = (entity, attributeId) => {
	if (!entity) return null;
	const attributes = entity.attributes || entity.item_attributes || [];
	const match = attributes.find((attribute) => attribute.id === attributeId || attribute.name === attributeId);
	return match?.value_name || match?.values?.[0]?.name || null;
};

const parseBedroomsValue = (raw) => {
	if (!raw) return null;
	const numbers = String(raw)
		.replace(',', '.')
		.match(/\d+(?:\.\d+)?/);
	return numbers ? Number(numbers[0]) : null;
};

const buildMercadoLibreDetailList = ({ roomsLabel, bathroomsLabel, detail }) => {
	const entries = [];
	if (roomsLabel) entries.push(String(roomsLabel).trim());
	if (bathroomsLabel) entries.push(String(bathroomsLabel).trim());
	const totalArea = pickAttributeValue(detail, 'TOTAL_AREA') || pickAttributeValue(detail, 'COVERED_AREA');
	if (totalArea) {
		entries.push(`Superficie: ${totalArea}`);
	}
	return entries.filter(Boolean);
};

const mapMercadoLibreListing = (summary, detail) => {
	const priceNumeric = Number(detail?.price ?? summary.price);
	const priceLabel =
		formatCurrencyLabel(priceNumeric, detail?.currency_id || summary.currency) || 'Precio no informado';
	const locationSource = detail?.location || detail?.seller_address || summary.location;
	const locationParts = [
		locationSource?.neighborhood?.name,
		locationSource?.address_line,
		locationSource?.city?.name || locationSource?.city_name,
		locationSource?.state?.name || locationSource?.state_name,
	]
		.filter(Boolean)
		.map((value) => value.trim())
		.filter((value, index, arr) => value && arr.indexOf(value) === index);
	const propertyTypeRaw =
		(summary.propertyType || pickAttributeValue(detail, 'PROPERTY_TYPE') || '').toLowerCase();
	const roomsLabel = summary.rooms || pickAttributeValue(detail, 'ROOMS');
	const bathroomsLabel = summary.bathrooms || pickAttributeValue(detail, 'BATHROOMS');
	const bedroomCount = parseBedroomsValue(roomsLabel);
	const listingDetails = buildMercadoLibreDetailList({ roomsLabel, bathroomsLabel, detail });
	const propertyType = (() => {
		if (propertyTypeRaw.includes('depart')) return 'departamento';
		if (propertyTypeRaw.includes('casa')) return 'casa';
		if (propertyTypeRaw.includes('oficina') || propertyTypeRaw.includes('local')) return 'oficina';
		if (propertyTypeRaw.includes('habit')) return 'habitacion';
		if (propertyTypeRaw.includes('parcela') || propertyTypeRaw.includes('terreno')) return 'parcela';
		return null;
	})();

	return {
		id: `ml-${summary.id}`,
		title: detail?.title || summary.title,
		description:
			detail?.descriptions?.[0]?.plain_text ||
			detail?.subtitle ||
			'PublicaciÃ³n disponible en Mercado Libre.',
		price: priceLabel,
		priceNumeric: Number.isFinite(priceNumeric) ? priceNumeric : null,
		location: locationParts.join(', ') || null,
		seller: detail?.seller_address?.city?.name
			? `Inmobiliaria en ${detail.seller_address.city.name}`
			: 'Mercado Libre',
		transactionType: 'rent',
		propertyType,
		bedroomCount,
		link: detail?.permalink || summary.permalink,
		image:
			detail?.pictures?.[0]?.secure_url ||
			detail?.pictures?.[0]?.url ||
			detail?.thumbnail ||
			summary.thumbnail ||
			summary.secure_thumbnail ||
			null,
		details: listingDetails,
		sourcePage: null,
		source: 'mercadolibre',
		sourceLabel: SOURCE_LABELS.mercadolibre,
		raw: { source: 'mercadolibre', id: summary.id },
	};
};

const buildMercadoLibreSearchFilters = (filters = {}, limit = MERCADO_LIBRE_DEFAULT_LIMIT) => {
	const keywords = [];
	if (filters.propertyType) keywords.push(filters.propertyType);
	if (filters.location) keywords.push(filters.location);
	if (filters.searchTerm) keywords.push(filters.searchTerm);
	const query = keywords.join(' ').replace(/\s+/g, ' ').trim() || 'arriendo maule';
	const minPrice = Number.isFinite(filters.minPrice) ? Math.max(filters.minPrice, 0) : null;
	const maxPrice = Number.isFinite(filters.maxPrice) ? filters.maxPrice : null;
	const priceRange = (() => {
		if (minPrice === null && maxPrice === null) return undefined;
		const lower = minPrice ?? 0;
		const upper = maxPrice ?? 999999999;
		return [lower, upper];
	})();
	const bedrooms = Array.isArray(filters.bedrooms) && filters.bedrooms.length
		? filters.bedrooms
			.map((value) => (String(value).includes('+') ? '4-10' : value))
			.join('-')
		: undefined;
	return {
		query,
		limit: Math.min(Math.max(limit, 1), MERCADO_LIBRE_MAX_LIMIT),
		priceRange,
		bedrooms,
		sort: 'price_asc',
		stateId: 'CL-MA',
	};
};

const normalizeText = (value = '') =>
	String(value || '')
		.normalize('NFD')
		.replace(/[^a-zA-Z0-9\s]/g, ' ')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();

const matchesBedroomsFilter = (bedroomCount, rules = []) => {
	if (!Array.isArray(rules) || !rules.length) return true;
	if (!Number.isFinite(bedroomCount)) return false;
	return rules.some((rule) => {
		const normalized = String(rule || '')
			.replace(/[^0-9+-]/g, '')
			.trim();
		if (!normalized) return false;
		if (normalized.includes('-')) {
			const [lowRaw, highRaw] = normalized.split('-');
			const low = Number(lowRaw);
			const high = Number(highRaw);
			if (Number.isFinite(low) && Number.isFinite(high)) {
				return bedroomCount >= low && bedroomCount <= high;
			}
		}
		if (normalized.endsWith('+')) {
			const value = Number(normalized.replace('+', ''));
			return Number.isFinite(value) ? bedroomCount >= value : false;
		}
		const numeric = Number(normalized);
		return Number.isFinite(numeric) ? bedroomCount === numeric : false;
	});
};

const filterListingsByCriteria = (listings = [], filters = {}) => {
	if (!Array.isArray(listings) || !listings.length) return [];
	return listings.filter((listing) => {
		if (filters.propertyType && listing.propertyType) {
			if (listing.propertyType !== filters.propertyType) return false;
		} else if (filters.propertyType && !listing.propertyType) {
			return false;
		}

		if (filters.transaction && listing.transactionType && filters.transaction !== listing.transactionType) {
			return false;
		}

		if (filters.location) {
			const locationText = normalizeText(listing.location);
			if (!locationText.includes(filters.location)) {
				return false;
			}
		}

		if (filters.searchTerm) {
			const haystack = normalizeText(
				[
					listing.title,
					listing.description,
					listing.location,
					listing.seller,
					Array.isArray(listing.details) ? listing.details.join(' ') : '',
				].join(' ')
			);
			if (!haystack.includes(filters.searchTerm)) {
				return false;
			}
		}

		if (filters.minPrice !== null && filters.minPrice !== undefined) {
			if (!Number.isFinite(listing.priceNumeric) || listing.priceNumeric < filters.minPrice) {
				return false;
			}
		}

		if (filters.maxPrice !== null && filters.maxPrice !== undefined) {
			if (!Number.isFinite(listing.priceNumeric) || listing.priceNumeric > filters.maxPrice) {
				return false;
			}
		}

		if (!matchesBedroomsFilter(listing.bedroomCount, filters.bedrooms)) {
			return false;
		}

		return true;
	});
};

const formatCacheAgeLabel = (ageMs) => {
	if (!Number.isFinite(ageMs) || ageMs <= 0) return null;
	const minutes = Math.floor(ageMs / 60000);
	const seconds = Math.round((ageMs % 60000) / 1000);
	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}
	return `${seconds}s`;
};

const getYapoDatasetSnapshot = async ({ runId, expectedTotal }) => {
	if (!runId) {
		return { dataset: [], cacheHit: false, cacheAgeMs: null };
	}
	const cached = getCachedYapoListings(runId, { expectedTotal });
	if (cached) {
		return { dataset: cached.listings || [], cacheHit: true, cacheAgeMs: cached.cacheAgeMs || 0 };
	}
	const dataset = await fetchAllListingsForRun(runId);
	setCachedRunListings(runId, dataset);
	return { dataset, cacheHit: false, cacheAgeMs: 0 };
};

const buildYapoListingResult = (dataset = [], filters = {}, page = 1, limit = FIXED_PAGE_SIZE) => {
	const safeLimit = Math.min(Math.max(limit, 1), 100);
	const filtered = filterListingsByCriteria(dataset, filters);
	const total = filtered.length;
	const totalPages = Math.max(1, Math.ceil((total || 1) / safeLimit));
	const safePage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
	const offset = (safePage - 1) * safeLimit;
	const pageListings = filtered.slice(offset, offset + safeLimit);
	const pagesWithListings = Array.from(
		new Set(
			dataset
				.map((listing) => listing?.sourcePage)
				.filter((value) => Number.isFinite(value))
		)
	).sort((a, b) => a - b);
	return {
		listings: pageListings,
		total,
		totalPages,
		page: safePage,
		limit: safeLimit,
		pagesWithListings,
	};
};

const fetchMercadoLibreListings = async (filters = {}, options = {}) => {
	const limit = Math.min(
		Math.max(Number(options.limit) || MERCADO_LIBRE_DEFAULT_LIMIT, 1),
		MERCADO_LIBRE_MAX_LIMIT
	);
	const upstreamLimit = Math.max(limit, MERCADO_LIBRE_CACHE_FETCH_MIN_LIMIT);
	const searchFilters = buildMercadoLibreSearchFilters(filters, upstreamLimit);
	const cacheKey = buildMercadoLibreCacheKey({
		query: searchFilters.query,
		location: filters.location,
		stateId: searchFilters.stateId,
	});

	const fromPayload = (payload) => {
		const filtered = filterListingsByCriteria(payload.listings || [], filters);
		const limited = filtered.slice(0, limit);
		return {
			listings: limited,
			total: filtered.length,
			requestUrl: payload.requestUrl,
			usedFallback: Boolean(payload.usedFallback),
			usedCache: Boolean(payload.usedCache),
			cacheAgeMs: payload.cacheAgeMs ?? null,
			detailBudgetExceeded: Boolean(payload.detailBudgetExceeded),
			error: null,
			fallbackNotice: payload.fallbackNotice,
		};
	};

	const cachedPack = cacheKey ? getCachedMercadoLibreListings(cacheKey) : null;
	if (cachedPack) {
		return fromPayload({ ...cachedPack, usedCache: true });
	}

	const runDetailEnrichment = async (summaries = []) => {
		if (!summaries.length) {
			return { listings: [], detailBudgetExceeded: false };
		}
		const enriched = new Array(summaries.length);
		let cursor = 0;
		let detailBudgetExceeded = false;
		const startedAt = Date.now();
		const worker = async () => {
			while (true) {
				const index = cursor++;
				if (index >= summaries.length) break;
				const listing = summaries[index];
				let detail = null;
				const elapsed = Date.now() - startedAt;
				if (elapsed < MERCADO_LIBRE_DETAIL_TIME_BUDGET_MS) {
					try {
						detail = await getMercadoLibreItemDetails(listing.id);
						if (MERCADO_LIBRE_DETAIL_DELAY_MS > 0) {
							await sleep(MERCADO_LIBRE_DETAIL_DELAY_MS);
						}
					} catch (detailError) {
						console.warn('No se pudo obtener el detalle de Mercado Libre', listing.id, detailError.message);
					}
				} else {
					detailBudgetExceeded = true;
				}
				enriched[index] = mapMercadoLibreListing(listing, detail);
			}
		};
		const workerCount = Math.min(MERCADO_LIBRE_DETAIL_CONCURRENCY, summaries.length);
		await Promise.all(Array.from({ length: workerCount }, () => worker()));
		return { listings: enriched, detailBudgetExceeded };
	};

	try {
		const searchResult = await searchMercadoLibreRentals({ ...searchFilters, limit: upstreamLimit });
		const trimmed = searchResult.results.slice(0, upstreamLimit);
		const { listings: enriched, detailBudgetExceeded } = await runDetailEnrichment(trimmed);
		if (cacheKey) {
			setCachedMercadoLibreListings(cacheKey, {
				listings: enriched,
				requestUrl: searchResult.requestUrl,
				usedFallback: false,
				detailBudgetExceeded,
			});
		}
		return fromPayload({
			listings: enriched,
			requestUrl: searchResult.requestUrl,
			usedFallback: false,
			detailBudgetExceeded,
		});
	} catch (error) {
		console.error('Error consultando Mercado Libre API:', error);
		try {
			const fallbackResult = await scrapeMercadoLibreFallback(
				{
					query: searchFilters.query,
					location: filters.location,
					stateId: searchFilters.stateId,
					propertyType: filters.propertyType,
				},
				{ limit: upstreamLimit }
			);
			if (cacheKey) {
				setCachedMercadoLibreListings(cacheKey, {
					listings: fallbackResult.listings,
					requestUrl: fallbackResult.requestUrl,
					usedFallback: true,
					detailBudgetExceeded: false,
				});
			}
			return fromPayload({
				listings: fallbackResult.listings,
				requestUrl: fallbackResult.requestUrl,
				usedFallback: true,
				detailBudgetExceeded: false,
				fallbackNotice: fallbackResult.total
					? 'Resultados obtenidos directamente desde la web pÃºblica de Mercado Libre.'
					: 'Se intentÃ³ el respaldo HTML de Mercado Libre pero no entregÃ³ publicaciones.',
			});
		} catch (fallbackError) {
			console.error('El fallback HTML de Mercado Libre tambiÃ©n fallÃ³:', fallbackError);
			return {
				listings: [],
				total: 0,
				requestUrl: null,
				error: fallbackError.message,
				usedFallback: true,
				detailBudgetExceeded: false,
				usedCache: false,
				fallbackNotice: null,
			};
		}
	}
};

const schedulePagesIfNeeded = async (run, pagesToPrime) => {
	const capped = Math.min(pagesToPrime, run.maxPages);
	if (capped <= 0) return [];
	const sequential = Array.from({ length: capped }, (_, index) => index + 1);
	const insertedPages = await addRunPages(run, sequential);
	insertedPages.forEach((pageNumber) => enqueueRunPageJob({ runId: run.id, pageNumber }));
	return insertedPages;
};

const formatListingForResponse = (listing) => {
	const sourceInfo = resolveListingSource(listing);
	return {
		id: listing.id,
		title: listing.title,
		description: listing.description,
		price: listing.price,
		priceNumeric: listing.priceNumeric,
		location: listing.location,
		seller: listing.seller,
		transactionType: listing.transactionType,
		propertyType: listing.propertyType,
		bedroomCount: listing.bedroomCount,
		link: listing.link,
		image: listing.image,
		details: Array.isArray(listing.details) ? listing.details : [],
		sourcePage: listing.sourcePage,
		source: sourceInfo.key,
		sourceLabel: sourceInfo.label,
	};
};

const buildPagination = (listingResult, fetchedPages = []) => {
	const sequence = Array.from({ length: Math.min(listingResult.totalPages, 20) }, (_, index) => index + 1);
	return {
		currentPage: listingResult.page,
		totalPages: listingResult.totalPages,
		pages: sequence.length ? sequence : [1],
		fetchedPages,
		hasNext: listingResult.page < listingResult.totalPages,
		hasPrev: listingResult.page > 1,
		nextPage: listingResult.page < listingResult.totalPages ? listingResult.page + 1 : null,
		prevPage: listingResult.page > 1 ? listingResult.page - 1 : null,
		pagesWithListings: listingResult.pagesWithListings,
	};
};

exports.scrapeUrl = async (req, res) => {
  const { url, jobReference } = req.body || {};
  if (!url) {
    return res.status(400).json({ message: 'Debes enviar la URL a procesar.' });
  }

  try {
    const allowed = await isPublicUrl(url);
    if (!allowed) {
      return res.status(400).json({ message: 'Solo se permiten URLs publicas.' });
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
  const parseBooleanFlag = (value) => {
    if (typeof value === 'boolean') return value;
    if (value === null || value === undefined) return false;
    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(normalized);
  };

  const buildEmptyMercadoLibrePack = () => ({
    listings: [],
    total: 0,
    requestUrl: null,
    usedFallback: false,
    detailBudgetExceeded: false,
    usedCache: false,
    cacheAgeMs: null,
    fallbackNotice: null,
    error: null,
  });

  try {
    const limit = clamp(Number(req.query.limit) || FIXED_PAGE_SIZE, 1, 100);
    const page = clamp(Number(req.query.page) || 1, 1, 999);
    const requestedPages = parsePagesParam(req.query.pages);
    const forceRefresh = parseBooleanFlag(req.query.forceRefresh);
    const sourceProvider = (req.query.sourceProvider || req.query.source || 'mixed').toString().toLowerCase();
    const shouldFetchYapo = sourceProvider !== 'mercado-libre-only';
    const shouldIncludeMercadoLibre = sourceProvider !== 'yapo-only';
    const mercadoLibreLimitParam = Number(req.query.mercadoLibreLimit);
    const mercadoLibreLimit = clamp(
      Number.isFinite(mercadoLibreLimitParam) ? mercadoLibreLimitParam : MERCADO_LIBRE_DEFAULT_LIMIT,
      1,
      MERCADO_LIBRE_MAX_LIMIT
    );
    const filters = normalizeListingFilters({
      propertyType: req.query.propertyType,
      transaction: req.query.transaction,
      location: req.query.location,
      bedrooms: req.query.bedrooms,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      searchTerm: req.query.search,
    });
    const region = DEFAULT_REGION;
    const category = DEFAULT_CATEGORY;
    const search = (req.query.search || '').trim();
    const requestedRunId = req.query.runId ? Number(req.query.runId) : null;

    const mercadoLibrePromise = shouldIncludeMercadoLibre
      ? fetchMercadoLibreListings(filters, { limit: mercadoLibreLimit })
      : Promise.resolve(buildEmptyMercadoLibrePack());

    const collectMercadoLibreWarnings = (pack) => {
      if (!pack) return [];
      const warnings = [];
      if (pack.fallbackNotice) {
        warnings.push(pack.fallbackNotice);
      }
      if (pack.usedCache) {
        const ageLabel = formatCacheAgeLabel(pack.cacheAgeMs);
        warnings.push(
          ageLabel ? `${MERCADO_LIBRE_CACHE_WARNING} (actualizado hace ${ageLabel}).` : MERCADO_LIBRE_CACHE_WARNING
        );
      }
      if (pack.detailBudgetExceeded) {
        warnings.push(MERCADO_LIBRE_DETAIL_WARNING);
      }
      if (!pack.listings.length) {
        if (pack.error) {
          warnings.push('Mercado Libre no respondio datos en este momento. Intenta nuevamente mas tarde.');
        } else if (shouldIncludeMercadoLibre) {
          warnings.push('No encontramos publicaciones en Mercado Libre para estos filtros.');
        }
      }
      return warnings;
    };

    if (!shouldFetchYapo) {
      const mercadoLibrePack = await mercadoLibrePromise;
      const warnings = collectMercadoLibreWarnings(mercadoLibrePack);
      const meta = {
        total: mercadoLibrePack.total,
        limit: mercadoLibreLimit,
        page: 1,
        totalPages: 1,
        runId: null,
        activeRunId: null,
        runStatus: 'mercado-libre-only',
        runCompletedAt: null,
        runStartedAt: null,
        region,
        category,
        search,
        maxPages: 0,
        pagesRequested: 0,
        pagesCompleted: [],
        pagesPending: [],
        pagesFailed: [],
        listingsIndexed: 0,
        filtersApplied: filters,
        sourceProvider,
        externalSources: {
          yapo: { total: 0, returned: 0, mode: 'disabled', cacheAgeMs: null },
          mercadoLibre: {
            total: mercadoLibrePack.total,
            returned: mercadoLibrePack.listings.length,
            requestUrl: mercadoLibrePack.requestUrl,
            mode: resolveMercadoLibreMode(mercadoLibrePack),
          },
        },
        totalCombined: mercadoLibrePack.listings.length,
      };
      const pagination = {
        currentPage: 1,
        totalPages: 1,
        pages: [1],
        fetchedPages: [],
        hasNext: false,
        hasPrev: false,
        nextPage: null,
        prevPage: null,
        pagesWithListings: mercadoLibrePack.listings.length ? [1] : [],
      };
      return res.json({
        meta,
        pagination,
        listings: mercadoLibrePack.listings,
        warnings,
      });
    }

    let activeRun = null;
    try {
      if (requestedRunId) {
        activeRun = await getRunById(requestedRunId);
      }
      if (!activeRun && !forceRefresh) {
        activeRun = await findReusableRun({ region, category, searchTerm: search });
      }
      if (!activeRun || forceRefresh) {
        activeRun = await createRun({ region, category, searchTerm: search, maxPages: requestedPages });
        await schedulePagesIfNeeded(activeRun, requestedPages);
      } else {
        await schedulePagesIfNeeded(activeRun, requestedPages);
      }
    } catch (error) {
      console.error('No fue posible preparar el run de scraping:', error);
      return res.status(500).json({ message: 'No se pudo preparar el scraping.' });
    }

    let servingRun = activeRun;
    if (activeRun.status !== 'completed') {
      const fallbackRun = await findLastCompletedRun({ region, category, searchTerm: search });
      if (fallbackRun) {
        servingRun = fallbackRun;
      } else if (activeRun.status === 'pending') {
        servingRun = null;
      }
    }

    const mercadoLibrePack = await mercadoLibrePromise;

    if (!servingRun) {
      const pendingWarnings = collectMercadoLibreWarnings(mercadoLibrePack);
      pendingWarnings.push(
        mercadoLibrePack.listings.length
          ? 'Los datos de Yapo aun se estan generando. Se muestran resultados de Mercado Libre mientras tanto.'
          : FALLBACK_MESSAGE
      );

      return res.status(202).json({
        meta: {
          total: 0,
          limit,
          page,
          runId: activeRun.id,
          activeRunId: activeRun.id,
          runStatus: activeRun.status,
          region,
          category,
          search,
          maxPages: activeRun.maxPages,
          pagesRequested: requestedPages,
          pagesCompleted: [],
          pagesPending: [],
          pagesFailed: [],
          listingsIndexed: 0,
          filtersApplied: filters,
          sourceProvider,
          externalSources: {
            yapo: { total: 0, returned: 0, mode: 'pending', cacheAgeMs: null },
            mercadoLibre: {
              total: mercadoLibrePack.total,
              returned: mercadoLibrePack.listings.length,
              requestUrl: mercadoLibrePack.requestUrl,
              mode: resolveMercadoLibreMode(mercadoLibrePack),
            },
          },
          totalCombined: mercadoLibrePack.listings.length,
        },
        pagination: {
          currentPage: page,
          totalPages: 1,
          pages: [1],
          fetchedPages: [],
          hasNext: false,
          hasPrev: false,
          nextPage: null,
          prevPage: null,
          pagesWithListings: [],
        },
        listings: mercadoLibrePack.listings,
        warnings: pendingWarnings,
      });
    }

    const progress = (await getRunProgress(servingRun.id)) || {
      pagesCompleted: [],
      pending: [],
      failed: [],
      listingsCount: 0,
    };
    const {
      dataset: yapoDataset,
      cacheHit: yapoCacheHit,
      cacheAgeMs: yapoCacheAgeMs,
    } = await getYapoDatasetSnapshot({
      runId: servingRun.id,
      expectedTotal: progress.listingsCount,
    });
    const listingResult = buildYapoListingResult(yapoDataset, filters, page, limit);
    const listings = listingResult.listings.map(formatListingForResponse);
    const supplementalListings = shouldIncludeMercadoLibre ? mercadoLibrePack.listings : [];
    const pagination = buildPagination(listingResult, progress.pagesCompleted || []);

    const warnings = collectMercadoLibreWarnings(mercadoLibrePack);
    if (yapoCacheHit) {
      const ageLabel = formatCacheAgeLabel(yapoCacheAgeMs);
      warnings.push(ageLabel ? `${YAPO_CACHE_WARNING} (actualizado hace ${ageLabel}).` : YAPO_CACHE_WARNING);
    }
    if (activeRun.id !== servingRun.id) {
      warnings.push('Mostrando datos del ultimo run completado mientras se construye uno nuevo.');
    }
    if (activeRun.status !== 'completed') {
      warnings.push('El scraping continua en segundo plano para recopilar mas paginas.');
    }
    if (!listingResult.total) {
      warnings.push('No se encontraron avisos que coincidan con los filtros aplicados.');
    }

    const meta = {
      total: listingResult.total,
      limit: listingResult.limit,
      page: listingResult.page,
      totalPages: listingResult.totalPages,
      runId: servingRun.id,
      activeRunId: activeRun.id,
      runStatus: activeRun.status,
      runCompletedAt: servingRun.completedAt,
      runStartedAt: servingRun.startedAt,
      region,
      category,
      search,
      maxPages: activeRun.maxPages,
      pagesRequested: requestedPages,
      pagesCompleted: progress.pagesCompleted,
      pagesPending: progress.pending,
      pagesFailed: progress.failed,
      listingsIndexed: progress.listingsCount,
      filtersApplied: filters,
      sourceProvider,
      externalSources: {
        yapo: {
          total: listingResult.total,
          returned: listings.length,
          mode: yapoCacheHit ? 'cache' : 'db',
          cacheAgeMs: yapoCacheHit ? yapoCacheAgeMs : null,
        },
        mercadoLibre: {
          total: mercadoLibrePack.total,
          returned: supplementalListings.length,
          requestUrl: mercadoLibrePack.requestUrl,
          mode: resolveMercadoLibreMode(mercadoLibrePack),
        },
      },
      totalCombined: listings.length + supplementalListings.length,
    };

    return res.json({
      meta,
      pagination,
      listings: listings.concat(supplementalListings),
      warnings,
    });
  } catch (error) {
    console.error('Error obteniendo avisos mixtos:', error);
    return res.status(500).json({ message: 'No se pudo obtener la informacion solicitada.' });
  }
};
