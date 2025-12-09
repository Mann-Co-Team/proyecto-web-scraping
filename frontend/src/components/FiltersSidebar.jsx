import PropTypes from 'prop-types';
import { useMemo } from 'react';

const PROPERTY_TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'casa', label: 'Casa' },
  { value: 'departamento', label: 'Departamento' },
  { value: 'parcela', label: 'Parcela / Terreno' },
  { value: 'oficina', label: 'Oficina / Local' },
  { value: 'habitacion', label: 'Habitación / Pieza' },
  { value: 'bodega', label: 'Bodega / Galpón' },
];

const LOCATION_OPTIONS = [
  { value: '', label: 'Todas las ubicaciones' },
  { value: 'talca', label: 'Talca' },
  { value: 'curicó', label: 'Curicó' },
  { value: 'linares', label: 'Linares' },
  { value: 'cauquenes', label: 'Cauquenes' },
  { value: 'constitución', label: 'Constitución' },
  { value: 'parral', label: 'Parral' },
  { value: 'molina', label: 'Molina' },
  { value: 'san javier', label: 'San Javier' },
  { value: 'maule', label: 'Maule' },
  { value: 'san clemente', label: 'San Clemente' },
];

const BEDROOM_OPTIONS = [
  { value: '1', label: '1 dormitorio' },
  { value: '2', label: '2 dormitorios' },
  { value: '3', label: '3 dormitorios' },
  { value: '4+', label: '4+ dormitorios' },
];

const SOURCE_OPTIONS = [
  { value: 'mixed', label: 'Yapo + Mercado Libre' },
  { value: 'yapo', label: 'Solo Yapo' },
  { value: 'mercadolibre', label: 'Solo Mercado Libre' },
];

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

export default function FiltersSidebar({ filters, onFiltersChange, onApply }) {
  const maxPriceDisplay = useMemo(() => formatCurrency(Number(filters.maxPrice) || 0), [filters.maxPrice]);
  const bedrooms = filters.bedrooms || [];

  const handleSelectChange = (event) => {
    const { name, value } = event.target;
    onFiltersChange({ [name]: value });
  };

  const handlePriceChange = (event) => {
    onFiltersChange({ maxPrice: Number(event.target.value) });
  };

  const handleBedroomToggle = (value) => {
    const current = filters.bedrooms || [];
    const exists = current.includes(value);
    const next = exists ? current.filter((item) => item !== value) : [...current, value];
    onFiltersChange({ bedrooms: next });
  };

  return (
    <aside className="filters-sidebar">
      <div className="filters-sidebar__header">
        <p className="filters-sidebar__eyebrow">Filtro inteligente</p>
        <h3>Refina tu búsqueda</h3>
        <p>Estos filtros se aplican localmente sobre los avisos ya descargados del backend.</p>
      </div>

      <div className="filters-sidebar__group">
        <label htmlFor="propertyType">Tipo de Propiedad</label>
        <select id="propertyType" name="propertyType" value={filters.propertyType} onChange={handleSelectChange}>
          {PROPERTY_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="filters-sidebar__group">
        <label htmlFor="location">Ubicación</label>
        <select id="location" name="location" value={filters.location} onChange={handleSelectChange}>
          {LOCATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="filters-sidebar__group">
        <label htmlFor="sourceProvider">Fuente</label>
        <select
          id="sourceProvider"
          name="sourceProvider"
          value={filters.sourceProvider}
          onChange={handleSelectChange}
        >
          {SOURCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="filters-sidebar__group">
        <label htmlFor="maxPrice">Precio Máximo</label>
        <input
          id="maxPrice"
          type="range"
          min="0"
          max="2000000"
          step="50000"
          value={filters.maxPrice}
          onChange={handlePriceChange}
        />
        <span className="filters-sidebar__price">{maxPriceDisplay}</span>
      </div>

      <div className="filters-sidebar__group">
        <label>Dormitorios</label>
        <div className="filters-sidebar__checkbox-group">
          {BEDROOM_OPTIONS.map((option) => (
            <label key={option.value} className="filters-sidebar__checkbox">
              <input
                type="checkbox"
                checked={bedrooms.includes(option.value)}
                onChange={() => handleBedroomToggle(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn--primary btn--full-width" onClick={onApply}>
        Aplicar filtros y recargar
      </button>
    </aside>
  );
}

FiltersSidebar.propTypes = {
  filters: PropTypes.shape({
    propertyType: PropTypes.string,
    location: PropTypes.string,
    maxPrice: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    bedrooms: PropTypes.arrayOf(PropTypes.string),
    sourceProvider: PropTypes.string,
  }).isRequired,
  onFiltersChange: PropTypes.func.isRequired,
  onApply: PropTypes.func,
};

FiltersSidebar.defaultProps = {
  onApply: () => {},
};
