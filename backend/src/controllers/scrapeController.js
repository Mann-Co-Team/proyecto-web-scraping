const db = require('../config/db');
const { getBrowser } = require('../services/puppeteerService');

exports.scrapeUrl = async (req, res) => {
  const { targetUrl } = req.body;
  const userId = req.user.id;

  if (!targetUrl) {
    return res.status(400).json({ message: 'Target URL is required.' });
  }

  // Validar que la URL sea de Yapo.cl (Mejora de seguridad)
  // if (!targetUrl.startsWith('https://www.yapo.cl/')) {
  //   return res.status(400).json({ message: 'Invalid target URL. Only yapo.cl is allowed.' });
  // }

  let jobResult;
  let jobId; // Definir jobId aquí para que esté disponible en el catch

  try {
    // Crear el trabajo de scraping en la base de datos
    jobResult = await db.query(
      'INSERT INTO scraping_jobs (user_id, target_url, status) VALUES ($1, $2, $3) RETURNING id',
      [userId, targetUrl, 'in_progress']
    );

    // ---- ¡CORRECCIÓN DE BUG 1! ----
    // jobResult.rows es un array, debes acceder al primer elemento [0].
    jobId = jobResult.rows[0].id;

    // Lógica de scraping
    const browser = getBrowser();
    const page = await browser.newPage();
    let scrapedData = {};

    try {
      // Aumentamos el timeout y esperamos a que la red esté inactiva
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // ---- LÓGICA DE SCRAPING ADAPTADA PARA YAPO.CL ----
      scrapedData = await page.evaluate(() => {
        // 1. Selector principal para CADA anuncio.
        //    (Debes encontrar el selector correcto usando "Inspeccionar")
        //    Ej: 'article.ad-item', 'tr.ad'
        const adSelector = 'article.listing-ad'; // <-- ¡CAMBIA ESTE SELECTOR!

        const adElements = document.querySelectorAll(adSelector);

        // 2. Mapear cada anuncio a un objeto
        const data = Array.from(adElements).map(ad => {
          // 3. Selectores INTERNOS para cada anuncio
          //    (Debes encontrarlos inspeccionando DENTRO del adSelector)
          const titleElement = ad.querySelector('h3.listing-ad__title'); // <-- ¡CAMBIA ESTO!
          const priceElement = ad.querySelector('.listing-ad__price'); // <-- ¡CAMBIA ESTO!
          const linkElement = ad.querySelector('a.listing-ad__link'); // <-- ¡CAMBIA ESTO!
          
          // 4. Extraer el texto y atributos
          const title = titleElement ? titleElement.innerText.trim() : null;
          const price = priceElement ? priceElement.innerText.trim() : null;
          const link = linkElement ? linkElement.href : null; // Obtener el link

          return { title, price, link };
        });

        return data; // Devolver el array de objetos
      });

      // ---- ¡CORRECCIÓN DE BUG 2! ----
      // La consulta INSERT estaba vacía.
      // Le pasamos el 'jobId' y los 'scrapedData'.
      // Usamos JSON.stringify para asegurar que el array se guarde como JSONB.
      await db.query(
        'INSERT INTO scraping_results (job_id, data) VALUES ($1, $2)',
        [jobId, JSON.stringify(scrapedData)]
      );

      // Actualizar el estado del trabajo
      await db.query(
        'UPDATE scraping_jobs SET status = $1 WHERE id = $2',
        ['completed', jobId]
      );

      res.status(200).json({ message: 'Scraping successful!', data: scrapedData });

    } catch (scrapeError) {
      console.error('Scraping failed:', scrapeError);
      
      // Actualizar el estado del trabajo a 'failed' si algo falla
      if (jobId) {
        await db.query(
          'UPDATE scraping_jobs SET status = $1 WHERE id = $2',
          ['failed', jobId]
        );
      }
      res.status(500).json({ message: 'Failed to scrape the URL.' });
    } finally {
      await page.close();
    }
  } catch (dbError) {
    console.error('Database error:', dbError);
    res.status(500).json({ message: 'Server error while processing the scraping job.' });
  }
};

exports.getJobs = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await db.query(
            'SELECT id, target_url, status, created_at FROM scraping_jobs WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ message: 'Failed to fetch scraping jobs.' });
    }
};