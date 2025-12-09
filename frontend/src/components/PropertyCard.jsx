import PropTypes from 'prop-types';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=60';

const SOURCE_LABELS = {
  yapo: 'Yapo.cl',
  mercadolibre: 'Mercado Libre',
  otras: 'Fuente externa',
};

const resolveSourceInfo = (source, sourceLabel) => {
  const rawValue = String(source || sourceLabel || '').trim();
  if (!rawValue) {
    return { key: 'yapo', label: SOURCE_LABELS.yapo };
  }
  const normalized = rawValue.toLowerCase();
  if (normalized.includes('mercado')) {
    return { key: 'mercadolibre', label: sourceLabel || SOURCE_LABELS.mercadolibre };
  }
  if (normalized.includes('yapo')) {
    return { key: 'yapo', label: sourceLabel || SOURCE_LABELS.yapo };
  }
  if (SOURCE_LABELS[normalized]) {
    return { key: normalized, label: sourceLabel || SOURCE_LABELS[normalized] };
  }
  return { key: 'otras', label: sourceLabel || rawValue };
};

export default function PropertyCard({ listing }) {
  const {
    title,
    price,
    description,
    location,
    seller,
    image,
    link,
    source,
    sourceLabel,
  } = listing;
  const sourceInfo = resolveSourceInfo(source, sourceLabel);

  return (
    <article className="property-card">
      <img
        src={image || FALLBACK_IMAGE}
        alt={title}
        className="property-image"
        loading="lazy"
        onError={(event) => {
          event.currentTarget.src = FALLBACK_IMAGE;
        }}
      />
      <div className="property-content">
        {sourceInfo.label && (
          <span className={`source-pill source-pill--${sourceInfo.key}`}>
            {sourceInfo.label}
          </span>
        )}
        <span className="property-price">{price || 'Precio no informado'}</span>
        <h3 className="property-title">{title}</h3>
        <p className="property-description">{description || 'Publicación sin descripción detallada.'}</p>
        <div className="property-location">
          <i className="fas fa-map-marker-alt" />
          <span>{location || 'Ubicación no disponible'}</span>
        </div>
        <div className="property-location" style={{ justifyContent: 'space-between' }}>
          <span><i className="fas fa-user" /> {seller || 'Anunciante'}</span>
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="btn btn--outline btn--sm">
              {sourceInfo.label ? `Ver en ${sourceInfo.label}` : 'Ver aviso'}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

PropertyCard.propTypes = {
  listing: PropTypes.shape({
    title: PropTypes.string,
    price: PropTypes.string,
    description: PropTypes.string,
    location: PropTypes.string,
    seller: PropTypes.string,
    image: PropTypes.string,
    link: PropTypes.string,
    source: PropTypes.string,
    sourceLabel: PropTypes.string,
  }).isRequired,
};
