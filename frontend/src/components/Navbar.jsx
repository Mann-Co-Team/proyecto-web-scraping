import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { isAuthenticated, user, logout, isLoading } = useAuth();
  const location = useLocation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navLinkClass = (path) => `nav-link ${location.pathname === path ? 'active' : ''}`;

  const handleLogout = () => {
    logout();
    setIsDropdownOpen(false);
  };

  return (
    <header className="header">
      <nav className="navbar">
        <div className="container">
          <div className="nav-content">
            <div className="nav-brand">
              <Link to="/" className="brand-title">
                ArriendosTalca
              </Link>
              <span className="brand-subtitle">Portal de Arriendos</span>
            </div>

            <div className="nav-menu">
              <Link to="/" className={navLinkClass('/')}>Inicio</Link>
              <a href="#propiedades" className="nav-link">
                Propiedades
              </a>
              <Link to="/dashboard" className={navLinkClass('/dashboard')}>
                Dashboard
              </Link>

              <div className="nav-auth" ref={dropdownRef}>
                {isLoading ? (
                  <span className="nav-link">Cargando...</span>
                ) : isAuthenticated ? (
                  <div className="user-dropdown">
                    <button
                      type="button"
                      className="user-dropdown-btn"
                      onClick={() => setIsDropdownOpen((prev) => !prev)}
                    >
                      <i className="fas fa-user" />
                      <span>{user?.name || user?.email || 'Usuario'}</span>
                      <i className="fas fa-chevron-down" />
                    </button>
                    {isDropdownOpen && (
                      <div className="user-dropdown-menu">
                        <Link className="dropdown-item" to="/dashboard" onClick={() => setIsDropdownOpen(false)}>
                          Mi Dashboard
                        </Link>
                        <div className="dropdown-divider" />
                        <button type="button" className="dropdown-item logout-btn" onClick={handleLogout}>
                          Cerrar Sesión
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <Link className="btn btn--outline btn--sm" to="/login">
                      Iniciar Sesión
                    </Link>
                    <Link className="btn btn--primary btn--sm" to="/register">
                      Registrarse
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}