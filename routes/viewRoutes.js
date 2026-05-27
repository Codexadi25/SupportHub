const express = require('express');
const router = express.Router();
const { getLoginPage, getRegisterPage, getAppPage } = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/authMiddleware');

router.get('/login', getLoginPage);
router.get('/register', getRegisterPage);
router.get('/', isAuthenticated, getAppPage);

// Brand new premium legal pages (accessible publicly)
router.get('/terms', (req, res) => {
    res.render('terms', { user: req.session?.user || null });
});

router.get('/privacy', (req, res) => {
    res.render('privacy', { user: req.session?.user || null });
});

module.exports = router;