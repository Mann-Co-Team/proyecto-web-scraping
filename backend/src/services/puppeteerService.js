const puppeteer = require('puppeteer');

let browserInstance = null;

async function initPuppeteer() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserInstance;
}

function getBrowser() {
  if (!browserInstance) {
    throw new Error('Puppeteer browser instance is not initialized. Call initPuppeteer() first.');
  }
  return browserInstance;
}

module.exports = { initPuppeteer, getBrowser };
