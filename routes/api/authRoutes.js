const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');
const {
  registerUser,
  loginUser,
  logoutUser,
  getUser,
} = require('../../controllers/authController');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.get('/user', protect, getUser);

module.exports = router;
