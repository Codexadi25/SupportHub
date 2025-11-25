const express = require('express');
const router = express.Router();
const authController = require('../../controllers/authController');

// @desc    Register new user
// @route   POST /api/auth/register
router.post('/register', authController.registerUser);

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
router.post('/login', authController.loginUser);

// @desc    Logout user
// @route   GET /api/auth/logout
router.get('/logout', authController.logoutUser);

// @desc    Get current user
// @route   GET /api/auth/user
router.get('/user', (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ message: 'Not authorized' });
  }
});

module.exports = router;