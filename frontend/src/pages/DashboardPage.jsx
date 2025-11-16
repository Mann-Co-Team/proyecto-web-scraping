import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    return <div>Redirigiendo...</div>;
  }

  return (
    <div className="dashboard-page">
      <h1>Dashboard</h1>
      <p>Bienvenido, {user?.name || 'Usuario'}</p>
      
      <div className="dashboard-content">
        <h2>Mis Scrapes</h2>
        <p>Aquí aparecerán tus tareas de web scraping</p>
        
        <section>
          <h3>Crear nuevo Scrape</h3>
          <p>Funcionalidad de scraping próximamente</p>
        </section>
      </div>
    </div>
  );
}
