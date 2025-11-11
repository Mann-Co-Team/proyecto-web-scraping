const express = require('express');
const { scrapeUrl, getJobs } = require('../controllers/scrapeController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Proteger rutas con el middleware de autenticación
router.post('/scrape', verifyToken, scrapeUrl);
router.get('/jobs', verifyToken, getJobs);

module.exports = router;
