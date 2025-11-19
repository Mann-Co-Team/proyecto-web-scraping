import { useCallback, useEffect, useMemo, useState } from 'react';
import PropertyCard from '../components/PropertyCard';

const REGION_OPTIONS = [{ value: 'maule', label: 'Región del Maule' }];

const CATEGORY_OPTIONS = [{ value: 'inmuebles', label: 'Inmuebles' }];

const DEFAULT_FILTERS = {
  region: REGION_OPTIONS[0].value,
  category: CATEGORY_OPTIONS[0].value,
  search: '',
};

const LIMIT = 12;

export default function HomePage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [listings, setListings] = useState([]);
  const [meta, setMeta] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const hasResults = listings.length > 0;

  const fetchListings = useCallback(async (currentFilters) => {
    setIsLoading(true);
    setError('');
    setWarnings([]);

    const params = new URLSearchParams({
      limit: String(LIMIT),
      region: currentFilters.region,
      category: currentFilters.category,
    });

    if (currentFilters.search.trim()) {
      params.set('search', currentFilters.search.trim());
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

      setListings(payload.listings || []);
      setMeta(payload.meta || null);
      setWarnings(warningList);
    } catch (err) {
      setError(err.message || 'Error inesperado al cargar los avisos.');
      setListings([]);
      setMeta(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings(DEFAULT_FILTERS);
  }, [fetchListings]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    fetchListings(filters);
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    fetchListings(DEFAULT_FILTERS);
  };

  const stats = useMemo(() => {
    if (!meta) {
      return [];
    }
    return [
      { label: 'Avisos encontrados', value: meta.total ?? '—' },
      { label: 'Región seleccionada', value: meta.region ?? '—' },
      { label: 'Categoría', value: meta.category ?? '—' },
    ];
  }, [meta]);

  return (
    <div className="home-page">
      <section className="hero" id="inicio">
        <div className="container">
          <div className="hero-content">
            <h1 className="hero-title">Encuentra arriendos en tiempo real</h1>
            <p className="hero-subtitle">
              Consulta directamente publicaciones de Yapo.cl y centraliza la información en esta maqueta reactiva.
            </p>

            <form className="search-box" onSubmit={handleSubmit}>
              <div className="search-filters">
                <div>
                  <label className="form-label" htmlFor="search">
                    Búsqueda (opcional)
                  </label>
                  <input
                    type="text"
                    id="search"
                    name="search"
                    className="form-control"
                    placeholder="Ej: departamento 2 dormitorios"
                    value={filters.search}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label className="form-label" htmlFor="region">
                    Región
                  </label>
                  <select
                    id="region"
                    name="region"
                    className="form-control"
                    value={filters.region}
                    onChange={handleChange}
                  >
                    {REGION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" htmlFor="category">
                    Categoría
                  </label>
                  <select
                    id="category"
                    name="category"
                    className="form-control"
                    value={filters.category}
                    onChange={handleChange}
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="search-actions">
                  <button type="submit" className="btn btn--primary btn--full-width">
                    <i className="fas fa-search" style={{ marginRight: 8 }} />
                    Buscar en Yapo
                  </button>
                  <button type="button" className="btn btn--secondary btn--full-width" onClick={handleReset}>
                    Limpiar filtros
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="featured-properties" id="propiedades">
        <div className="container">
          <h2 className="section-title">Resultados en vivo</h2>

          {meta && (
            <div className="meta-bar">
              <span>
                Mostrando {listings.length} de {meta.total ?? listings.length} avisos disponibles.
              </span>
              {meta.targetUrl && (
                <a href={meta.targetUrl} target="_blank" rel="noreferrer">
                  Ver búsqueda original en Yapo
                </a>
              )}
            </div>
          )}

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

          {!isLoading && !error && !hasResults && (
            <div className="empty-state">
              <i className="fas fa-search" />
              <p>No encontramos avisos con los filtros actuales.</p>
            </div>
          )}

          {!isLoading && hasResults && (
            <div className="properties-grid">
              {listings.map((listing, index) => (
                <PropertyCard key={listing.link || `${listing.title}-${index}`} listing={listing} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
