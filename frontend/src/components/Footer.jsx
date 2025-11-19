import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h4>ArriendosTalca</h4>
            <p>Tu portal de confianza para reunir la información scrapeada desde Yapo.cl.</p>
          </div>
          <div className="footer-section">
            <h4>Enlaces</h4>
            <ul>
              <li><a href="#inicio">Inicio</a></li>
              <li><a href="#propiedades">Propiedades</a></li>
              <li><Link to="/dashboard">Dashboard</Link></li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Contacto</h4>
            <p><i className="fas fa-phone" /> +56 71 234 5678</p>
            <p><i className="fas fa-envelope" /> soporte@arriendostalca.cl</p>
            <p><i className="fas fa-map-marker-alt" /> Talca, Región del Maule</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} ArriendosTalca. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
