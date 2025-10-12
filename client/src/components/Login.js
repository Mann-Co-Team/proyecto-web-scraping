import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/authService';

const Login = () => {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [serverError, setServerError] = useState('');
  const navigate = useNavigate();

  const onSubmit = async (data) => {
    try {
      await login(data.email, data.password);
      navigate('/dashboard');
    } catch (error) {
      setServerError(error.response?.data?.message ||
        'Login failed. Please try again.');
    }
  };

  return (
    <div>
      <h2>Login</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label>Email</label>
          <input 
            type="email" 
            {...register('email', { required: 'Email is required' })} 
          />
          {errors.email && <p>{errors.email.message}</p>}
        </div>
        <div>
          <label>Password</label>
          <input 
            type="password" 
            {...register('password', { required: 'Password is required' })} 
          />
          {errors.password && <p>{errors.password.message}</p>}
        </div>
        {serverError && <p style={{ color: 'red' }}>{serverError}</p>}
        <button type="submit">Login</button>
      </form>
    </div>
  );
};

export default Login;
