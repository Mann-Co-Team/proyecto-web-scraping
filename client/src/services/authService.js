import api from './api';

export const login = async (email, password) => {
  const response = await api.post('/api/auth/login', { email, password });
  if (response.data.token) {
    localStorage.setItem('token', response.data.token);
  }
  return response.data;
};

export const register = (email, password) => {
  return api.post('/api/auth/signup', { email, password });
};

export const logout = () => {
  localStorage.removeItem('token');
};
