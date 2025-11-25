const express = require('express');
const router = express.Router();
const { loginUser, logoutUser, getRegisterPage, registerUser } = require('../controllers/authController');

router.get('/register', getRegisterPage);
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/logout', logoutUser);

module.exports = router;