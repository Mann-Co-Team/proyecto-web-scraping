require('dotenv').config();
const app = require('./app');
const { initPuppeteer } = require('./services/puppeteerService');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Inicializar la instancia de Puppeteer al arrancar el servidor
    await initPuppeteer();
    console.log('Puppeteer instance initialized.');

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
