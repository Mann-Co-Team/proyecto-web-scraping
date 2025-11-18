const puppeteer = require('puppeteer');

exports.scrape = async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Falta el parametro url' });
  }

  let browser;
  let page;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    try {
      await page.waitForSelector('#currentlistings', { timeout: 10000 });
    } catch (err) {
      console.warn('Elemento #currentlistings no aparecio, se continuara igualmente');
    }

    const data = await page.evaluate(() => {
      const parent = document.getElementById('currentlistings');
      if (!parent) {
        return { error: 'No se encontro #currentlistings', count: 0, ads: [] };
      }
      const grid = parent.querySelector('.d3-ads-grid.d3-ads-grid--category-list');
      if (!grid) {
        return { error: 'No se encontro .d3-ads-grid', count: 0, ads: [] };
      }

      const adElements = Array.from(grid.children);
      const ads = adElements
        .map((ad) => {
          const titleEl = ad.querySelector('.d3-ad-tile__title');
          const priceEl = ad.querySelector('.d3-ad-tile__price');
          const sellerEl = ad.querySelector('.d3-ad-tile__seller > span');
          const locationEl = ad.querySelector('.d3-ad-tile__location');
          const descEl = ad.querySelector('.d3-ad-tile__short-description');
          const linkEl = ad.querySelector('a.d3-ad-tile__description');
          const imgEl = ad.querySelector('.d3-ad-tile__cover img');

          return {
            title: titleEl ? titleEl.innerText.trim() : '',
            price: priceEl ? priceEl.innerText.trim() : '',
            seller: sellerEl ? sellerEl.innerText.trim() : '',
            location: locationEl ? locationEl.innerText.trim() : '',
            description: descEl ? descEl.innerText.trim() : '',
            image: imgEl ? imgEl.src : null,
            link: linkEl ? linkEl.href : null
          };
        })
        .filter((ad) => ad.title);

      return {
        error: null,
        count: ads.length,
        ads
      };
    });

    return res.status(200).json({ status: 'success', url: targetUrl, data });
  } catch (error) {
    console.error('Error durante el scraping:', error);
    return res.status(500).json({ error: 'Error interno del servidor al hacer scraping' });
  } finally {
    if (page) {
      try { await page.close(); } catch (_) {}
    }
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
  }
};
