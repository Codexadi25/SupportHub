const express = require('express');
const router = express.Router();
const { loginUser, logoutUser, getRegisterPage, registerUser, reportUnauthorized } = require('../controllers/authController');

router.get('/register', getRegisterPage);
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/logout', logoutUser);
router.post('/report-unauthorized', reportUnauthorized);

module.exports = router;