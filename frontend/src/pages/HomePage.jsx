import { useCallback, useEffect, useMemo, useState } from 'react';
import FiltersSidebar from '../components/FiltersSidebar';
import PropertyCard from '../components/PropertyCard';

const DEFAULT_SERVER_FILTERS = {
  region: 'maule',
  category: 'inmuebles',
  search: '',
};

const DEFAULT_CLIENT_FILTERS = {
  propertyType: '',
  location: '',
  maxPrice: 1_000_000,
  bedrooms: [],
};

const PROPERTY_TYPE_KEYWORDS = {
  casa: ['casa'],
  departamento: ['departamento', 'depto'],
  parcela: ['parcela', 'terreno', 'sitio'],
  oficina: ['oficina', 'local', 'comercial'],
  habitacion: ['habitación', 'habitacion', 'pieza'],
  bodega: ['bodega', 'galpón', 'galpon'],
};

const LIMIT = 60;

const parsePriceToNumber = (text) => {
  if (!text) return null;
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
};

const extractBedrooms = (listing) => {
  const raw = `${listing.title || ''} ${listing.description || ''}`.toLowerCase();
  const match = raw.match(/(\d+)\s*(dorm|habitaci|pieza)/);
  if (!match) return null;
  return Number(match[1]);
};

const applyClientFilters = (listings, filters) => {
  const locationFilter = filters.location.trim().toLowerCase();
  const maxPrice = Number(filters.maxPrice) || null;
  const propertyType = filters.propertyType;
  const bedrooms = filters.bedrooms || [];

  const hasActiveFilters = Boolean(locationFilter || maxPrice || propertyType || bedrooms.length);

  const filtered = listings.filter((listing) => {
    const haystack = `${listing.title || ''} ${listing.description || ''}`.toLowerCase();
    const priceNumber = parsePriceToNumber(listing.price);
    const locationMatch = locationFilter ? (listing.location || '').toLowerCase().includes(locationFilter) : true;
    const priceMatch = maxPrice ? (priceNumber ? priceNumber <= maxPrice : false) : true;
    const typeMatch = propertyType
      ? PROPERTY_TYPE_KEYWORDS[propertyType]?.some((keyword) => haystack.includes(keyword))
      : true;
    const listingBedrooms = extractBedrooms(listing);
    const bedroomsMatch = bedrooms.length
      ? bedrooms.some((value) => (value === '4+' ? (listingBedrooms ?? 0) >= 4 : listingBedrooms === Number(value)))
      : true;

    return locationMatch && priceMatch && typeMatch && bedroomsMatch;
  });

  return { filtered, hasActiveFilters };
};

export default function HomePage() {
  const [serverFilters, setServerFilters] = useState(DEFAULT_SERVER_FILTERS);
  const [clientFilters, setClientFilters] = useState(DEFAULT_CLIENT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [rawListings, setRawListings] = useState([]);
  const [listings, setListings] = useState([]);
  const [meta, setMeta] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [clientSummary, setClientSummary] = useState({ filteredCount: 0, hasActiveFilters: false });

  const fetchListings = useCallback(
    async ({ region, category, search }) => {
      setIsLoading(true);
      setError('');
      setWarnings([]);

      const params = new URLSearchParams({
        limit: String(LIMIT),
        region,
        category,
      });

      if (search.trim()) {
        params.set('search', search.trim());
      }

      try {
        const response = await fetch(`/api/yapo-listings?${params.toString()}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.message || 'No se pudo obtener la información desde Yapo.cl');
        }

        const warningList = Array.isArray(payload.warnings)
          ? payload.warnings
          : payload.warnings
          ? [payload.warnings]
          : [];

        setRawListings(payload.listings || []);
        setMeta(payload.meta || null);
        setWarnings(warningList);
      } catch (err) {
        setError(err.message || 'Error inesperado al cargar los avisos.');
        setRawListings([]);
        setMeta(null);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchListings(DEFAULT_SERVER_FILTERS);
  }, [fetchListings]);

  useEffect(() => {
    const { filtered, hasActiveFilters } = applyClientFilters(rawListings, clientFilters);
    setListings(filtered);
    setClientSummary({ filteredCount: filtered.length, hasActiveFilters });
  }, [rawListings, clientFilters]);

  const handleHeroSubmit = (event) => {
    event.preventDefault();
    const nextFilters = { ...serverFilters, search: searchInput };
    setServerFilters(nextFilters);
    fetchListings(nextFilters);
  };

  const handleHeroReset = () => {
    setSearchInput('');
    setServerFilters(DEFAULT_SERVER_FILTERS);
    fetchListings(DEFAULT_SERVER_FILTERS);
  };

  const handleSidebarChange = (patch) => {
    setClientFilters((prev) => ({ ...prev, ...patch }));
  };

  const handleSidebarApply = () => {
    fetchListings(serverFilters);
  };

  const stats = useMemo(() => {
    if (!meta) {
      return [];
    }
    return [
      { label: 'Avisos descargados', value: rawListings.length },
      { label: 'Avisos visibles', value: listings.length },
      { label: 'Región', value: meta.region ?? 'Maule' },
    ];
  }, [meta, listings.length, rawListings.length]);

  return (
    <div className="home-page">
      <section className="hero hero--compact" id="inicio">
        <div className="container">
          <div className="hero-content">
            <p className="hero-eyebrow">Portal de arriendos para la Región del Maule</p>
            <h1 className="hero-title">Encuentra tu hogar ideal en Talca</h1>
            <p className="hero-subtitle">
              El backend consulta Yapo.cl en vivo y aquí aplicas filtros locales sin volver a descargar los datos.
            </p>

            <form className="hero-search" onSubmit={handleHeroSubmit}>
              <input
                type="text"
                placeholder="Ej: departamento 2 dormitorios"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              <button type="submit" className="btn btn--primary">
                <i className="fas fa-search" /> Buscar
              </button>
              <button type="button" className="btn btn--secondary" onClick={handleHeroReset}>
                Limpiar
              </button>
            </form>

            <div className="hero-pills">
              <span>Maule</span>
              <span>Inmuebles</span>
            </div>
          </div>
        </div>
      </section>

      <section className="featured-properties" id="propiedades">
        <div className="container">
          <div className="properties-layout">
            <FiltersSidebar
              filters={clientFilters}
              onFiltersChange={handleSidebarChange}
              onApply={handleSidebarApply}
            />

            <div className="properties-content">
              <h2 className="section-title" style={{ textAlign: 'left' }}>
                Resultados en vivo
              </h2>

              <div className="meta-bar meta-bar--stacked">
                <span>
                  Mostrando {listings.length} de {meta?.total ?? rawListings.length} avisos (limit {LIMIT}).
                </span>
                {clientSummary.hasActiveFilters && (
                  <span className="meta-chip">
                    Filtros locales activos · {clientSummary.filteredCount} coincidencias
                  </span>
                )}
                {meta?.targetUrl && (
                  <a href={meta.targetUrl} target="_blank" rel="noreferrer">
                    Ver búsqueda original en Yapo
                  </a>
                )}
              </div>

              {warnings.map((warning, index) => (
                <div key={`${warning}-${index}`} className="warning-banner">
                  {warning}
                </div>
              ))}

              {error && <div className="error-message">{error}</div>}

              {stats.length > 0 && (
                <div className="stats-grid">
                  {stats.map((stat) => (
                    <div key={stat.label} className="stat-card">
                      <h4>{stat.label}</h4>
                      <strong>{stat.value}</strong>
                    </div>
                  ))}
                </div>
              )}

              {isLoading && (
                <div className="loading">
                  <i className="fas fa-spinner" /> Cargando avisos de Yapo...
                </div>
              )}

              {!isLoading && !error && listings.length === 0 && (
                <div className="empty-state">
                  <i className="fas fa-search" />
                  <p>No encontramos avisos con los filtros actuales.</p>
                </div>
              )}

              {!isLoading && listings.length > 0 && (
                <div className="properties-grid">
                  {listings.map((listing, index) => (
                    <PropertyCard key={listing.link || `${listing.title}-${index}`} listing={listing} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
