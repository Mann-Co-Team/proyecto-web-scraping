import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import api from '../services/api';

const Dashboard = () => {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [isLoading, setIsLoading] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [serverError, setServerError] = useState('');
  const [jobs, setJobs] = useState([]);

  const fetchJobs = async () => {
    try {
      const response = await api.get('/api/jobs');
      setJobs(response.data);
    } catch (error) {
      console.error("Failed to fetch jobs", error);
    }
  };

  useEffect(() => {
    fetchJobs();
  },);

  const onSubmit = async (data) => {
    setIsLoading(true);
    setServerError('');
    setScrapeResult(null);
    try {
      const response = await api.post('/api/scrape', { targetUrl: data.url });
      setScrapeResult(response.data.data);
      fetchJobs(); // Refresh jobs list
    } catch (error) {
setServerError(error.response?.data?.message ||
  'Scraping failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h2>Web Scraping Dashboard</h2>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label>URL to Scrape</label>
          <input 
            type="url" 
            {...register('url', { required: 'URL is required' })} 
            placeholder="https://example.com"
          />
          {errors.url && <p>{errors.url.message}</p>}
        </div>
        <button type="submit" disabled={isLoading}>
          {isLoading? 'Scraping...' : 'Scrape'}
        </button>
      </form>

      {serverError && <p style={{ color: 'red' }}>{serverError}</p>}

      {scrapeResult && (
        <div>
          <h3>Last Scrape Result:</h3>
          <pre>{JSON.stringify(scrapeResult, null, 2)}</pre>
        </div>
      )}

      <div>
        <h3>Scraping History</h3>
        <table>
          <thead>
            <tr>
              <th>URL</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.id}>
                <td>{job.target_url}</td>
                <td>{job.status}</td>
                <td>{new Date(job.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
