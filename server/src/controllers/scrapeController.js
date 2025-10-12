const db = require('../config/db');
const { getBrowser } = require('../services/puppeteerService');

exports.scrapeUrl = async (req, res) => {
  const { targetUrl } = req.body;
  const userId = req.user.id;

  if (!targetUrl) {
    return res.status(400).json({ message: 'Target URL is required.' });
  }

  let jobResult;
  try {
    // Crear el trabajo de scraping en la base de datos
    jobResult = await db.query(
      'INSERT INTO scraping_jobs (user_id, target_url, status) VALUES ($1, $2, $3) RETURNING id',
      [userId, targetUrl, 'in_progress']
    );
    const jobId = jobResult.rows.id;

    // Lógica de scraping
    const browser = getBrowser();
    const page = await browser.newPage();
    let scrapedData = {};

    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle2' });

      // Ejemplo de extracción: Título, descripción y todos los enlaces
      scrapedData = await page.evaluate(() => {
        const title = document.title;
const description = document.querySelector('meta[name="description"]')?.content || null;
        const links = Array.from(document.querySelectorAll('a')).map(a => a.href);
        return { title, description, links };
      });

      // Guardar los resultados
      await db.query(
        'INSERT INTO scraping_results (job_id, data) VALUES ($1, $2)',
       
      );

      // Actualizar el estado del trabajo
      await db.query(
        'UPDATE scraping_jobs SET status = $1 WHERE id = $2',
        ['completed', jobId]
      );

      res.status(200).json({ message: 'Scraping successful!', data: scrapedData });

    } catch (scrapeError) {
      console.error('Scraping failed:', scrapeError);
      await db.query(
        'UPDATE scraping_jobs SET status = $1 WHERE id = $2',
        ['failed', jobId]
      );
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