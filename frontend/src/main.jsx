// client/src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// 1. Importa el BrowserRouter
import { BrowserRouter } from 'react-router-dom';
// También importa el AuthProvider que discutimos para el login
import { AuthProvider } from './context/AuthContext.jsx'; // (Debes crear este archivo)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* 2. Envuelve tu App con BrowserRouter y tu AuthProvider */}
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);