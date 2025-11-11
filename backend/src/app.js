const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const scrapeRoutes = require('./routes/scrapeRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api', scrapeRoutes);

// Manejador de errores básico
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

module.exports = app;
