const db = require('../config/db');
const { getBrowser } = require('../services/puppeteerService');
const { enqueueScrape, isPublicUrl } = require('../queues/scrapeQueue');

exports.scrapeUrl = async (req, res) => {
  const { targetUrl, jobReference } = req.body;
  try {
    if (!targetUrl) return res.status(400).json({ message: 'targetUrl requerido' });
    const ok = await isPublicUrl(targetUrl);
    if (!ok) return res.status(400).json({ message: 'URL inválida o no pública' });

    // encolar trabajo y responder inmediatamente
    const jobId = enqueueScrape({ targetUrl, jobReference, userId: req.user?.id || null });
    return res.status(202).json({ jobId, status: 'queued' });
  } catch (err) {
    return res.status(500).json({ message: 'Error interno' });
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