import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNotifications } from './NotificationContext.jsx';

// Crear el contexto de autenticación
const AuthContext = createContext();

// Proveedor de autenticación
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { notify } = useNotifications();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (token) {
      setIsAuthenticated(true);
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (_) {
          setUser(null);
        }
      }
    }
    setIsLoading(false);
  }, []);

  // Función para login
  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Error en la autenticación');
      }

      const data = await response.json();
      setUser(data.user);
      setIsAuthenticated(true);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user || null));
      notify('Sesión iniciada correctamente.', { type: 'success' });
      return data;
    } catch (err) {
      setError(err.message);
      notify(err.message || 'No se pudo iniciar sesión', { type: 'error' });
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  // Función para logout
  const logout = useCallback(() => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setError(null);
    notify('Sesión cerrada.', { type: 'info' });
  }, [notify]);

  // Función para registrarse
  const register = useCallback(async (email, password, name) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      });

      if (!response.ok) {
        throw new Error('Error en el registro');
      }

      const data = await response.json();
      setUser(data.user);
      setIsAuthenticated(true);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user || null));
      notify('Registro exitoso. Sesión iniciada.', { type: 'success' });
      return data;
    } catch (err) {
      setError(err.message);
      notify(err.message || 'No se pudo registrar', { type: 'error' });
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [notify]);

  const value = {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    register,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook personalizado para usar el contexto
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};
