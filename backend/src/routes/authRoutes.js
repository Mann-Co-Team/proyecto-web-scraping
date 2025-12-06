const express = require('express');
const {
	signup,
	login,
	requestPasswordReset,
	resetPassword,
	getProfile,
	updateProfile,
	deleteAccount,
} = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.get('/me', verifyToken, getProfile);
router.put('/me', verifyToken, updateProfile);
router.delete('/me', verifyToken, deleteAccount);

module.exports = router;
