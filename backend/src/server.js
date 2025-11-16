require('dotenv').config();
const express = require('express');
const app = require('./app'); // si tu app exporta el express app desde app.js
const { initPuppeteer } = require('./services/puppeteerService');

async function start() {
  try {
    // iniciar dependencias críticas
    await initPuppeteer();

    // arrancar la cola de scrapes después de que puppeteer esté listo
    const scrapeQueue = require('./queues/scrapeQueue');
    if (typeof scrapeQueue.startWorkers === 'function') {
      scrapeQueue.startWorkers();
    }

    const port = process.env.PORT || 3000;
    // si app es un objeto express (importado desde ./app), arranca el servidor
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

    // manejar errores no capturados para debug durante desarrollo
    process.on('unhandledRejection', (reason, p) => {
      console.error('Unhandled Rejection at:', p, 'reason:', reason);
    });
    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      // en producción podrías reiniciar el proceso; aquí sólo logueamos
    });

    return server;
  } catch (err) {
    console.error('Fallo al iniciar dependencias:', err);
    // dejar nodemon manejar restart tras el crash inicial
    process.exit(1);
  }
}

start();
