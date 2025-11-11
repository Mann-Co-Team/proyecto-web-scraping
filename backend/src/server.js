require('dotenv').config();
const app = require('./app');
const { initPuppeteer } = require('./services/puppeteerService');
// importa la cola para arrancarla (en el módulo la cola arranca con el require)
require('./queues/scrapeQueue');

(async () => {
  try {
    await initPuppeteer(); // asegura que el navegador se inicie al levantar el servidor
    console.log('Puppeteer instance initialized.');

    app.listen(process.env.PORT || 5000, () => {
      console.log(`Server is running on port ${process.env.PORT || 5000}`);
    });
  } catch (err) {
    console.error('Fallo al iniciar dependencias:', err);
    process.exit(1);
  }
})();
