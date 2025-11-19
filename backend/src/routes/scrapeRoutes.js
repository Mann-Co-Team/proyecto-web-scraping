const express = require('express');
const { scrapeUrl, getJobs, getYapoListings } = require('../controllers/scrapeController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Proteger rutas con el middleware de autenticación
router.post('/scrape', verifyToken, scrapeUrl);
router.get('/jobs', verifyToken, getJobs);
router.get('/yapo-listings', getYapoListings);

module.exports = router;
