// client/src/App.jsx

import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar'; // (Necesitas crear este componente)
import HomePage from './pages/HomePage'; // (Necesitas crear esta página)
import LoginPage from './pages/LoginPage'; // (Necesitas crear esta página)
import RegisterPage from './pages/RegisterPage'; // (Necesitas crear esta página)
import DashboardPage from './pages/DashboardPage'; // (Necesitas crear esta página)
import './App.css'; // Puedes borrar el contenido de este CSS si quieres

function App() {
  return (
    <div>
      {/* 1. El Navbar ahora vive aquí, fuera de las rutas,
             para que se muestre en TODAS las páginas */}
      <Navbar />

      {/* 2. Este contenedor define dónde se renderizarán tus páginas */}
      <main>
        <Routes>
          {/* 3. Define cada ruta y el componente que debe mostrar */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<h2>Página no encontrada (404)</h2>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;