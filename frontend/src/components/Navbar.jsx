// client/src/components/Navbar.jsx

import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // (Usando el contexto de login)

export default function Navbar() {
  const { isAuthenticated, logout } = useAuth();

  return (
    <nav>
      {/* Usa <Link> para la navegación interna */}
      <Link to="/">Inicio</Link>
      <Link to="/dashboard">Dashboard</Link>

      <div>
        {isAuthenticated ? (
          <button onClick={logout}>Cerrar Sesión</button>
        ) : (
          <>
            <Link to="/login">Iniciar Sesión</Link>
            <Link to="/register">Registrarse</Link>
          </>
        )}
      </div>
    </nav>
  );
}