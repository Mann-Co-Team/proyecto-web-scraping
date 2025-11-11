const puppeteer = require('puppeteer');

let browser = null;

async function initPuppeteer() {
  if (browser) return browser;
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  return browser;
}

async function scrapeUrl(targetUrl, options = {}) {
  if (!browser) await initPuppeteer();
  const page = await browser.newPage();
  try {
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60_000 });
    const content = await page.content();
    // si ya existen funciones de extracción, adaptarlas aquí
    await page.close();
    return { html: content };
  } catch (err) {
    await page.close();
    throw err;
  }
}

module.exports = {
  initPuppeteer,
  scrapeUrl,
  // opcional: exponer browser para tareas administrativas
  _getBrowser: () => browser,
};
