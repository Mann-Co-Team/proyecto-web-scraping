import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function HomePage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="home-page">
      <h1>Bienvenido a Web Scraping</h1>
      <p>Sistema de web scraping con autenticación</p>
      
      {isAuthenticated ? (
        <div>
          <p>¡Hola, {user?.name || 'Usuario'}!</p>
          <Link to="/dashboard">Ir al Dashboard</Link>
        </div>
      ) : (
        <div>
          <p>Inicia sesión o regístrate para comenzar</p>
          <Link to="/login">Iniciar Sesión</Link>
          <Link to="/register">Registrarse</Link>
        </div>
      )}
    </div>
  );
}
