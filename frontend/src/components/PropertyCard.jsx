import PropTypes from 'prop-types';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=60';

export default function PropertyCard({ listing }) {
  const {
    title,
    price,
    description,
    location,
    seller,
    image,
    link,
  } = listing;

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
              Ver en Yapo
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
  }).isRequired,
};
