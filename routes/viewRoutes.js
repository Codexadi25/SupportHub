const express = require('express');
const router = express.Router();
const { getLoginPage, getRegisterPage, getAppPage } = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// Public landing page — accessible to all (also reachable via /home)
router.get('/home', (req, res) => {
    res.render('home', { user: req.session?.user || null });
});

router.get('/login', getLoginPage);
router.get('/register', getRegisterPage);

// Root: show home page for guests, load the app for authenticated users
router.get('/', (req, res, next) => {
    if (req.session && req.session.user) {
        // Logged-in → load the full dashboard/app
        return getAppPage(req, res, next);
    }
    // Guest → show the landing page
    res.render('home', { user: null });
});


// Brand new premium legal pages (accessible publicly)
router.get('/terms', (req, res) => {
    res.render('terms', { user: req.session?.user || null });
});

router.get('/privacy', (req, res) => {
    res.render('privacy', { user: req.session?.user || null });
});

module.exports = router;