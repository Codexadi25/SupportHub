const express = require('express');
const router = express.Router();
const { getLoginPage, getAppPage } = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/authMiddleware');

router.get('/login', getLoginPage);
router.get('/', isAuthenticated, getAppPage);

module.exports = router;