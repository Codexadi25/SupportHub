const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');

// GET register page
router.get('/register', (req, res) => {
  res.render('register', { error: null, success: null, username: '' });
});

// POST register
router.post('/register', async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body || {};
    const cleanUsername = String(username || '').trim().toLowerCase();

    if (!cleanUsername || !password || !confirmPassword) {
      return res.render('register', { error: 'Please fill all fields', success: null, username: cleanUsername });
    }
    if (password.length < 6) {
      return res.render('register', { error: 'Password must be at least 6 characters', success: null, username: cleanUsername });
    }
    if (password !== confirmPassword) {
      return res.render('register', { error: 'Passwords do not match', success: null, username: cleanUsername });
    }

    const existing = await User.findOne({ username: cleanUsername });
    if (existing) {
      return res.render('register', { error: 'Username already exists', success: null, username: cleanUsername });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const user = new User({
      _id: uuidv4(),
      username: cleanUsername,
      password: hashed
    });

    await user.save();

    // create session (simple user info)
    req.session.user = { _id: user._id, userId: user.userId, username: user.username, role: user.role };

    // Successful registration -> redirect to dashboard or show success message
    return res.redirect('/dashboard');
  } catch (err) {
    console.error('Register error:', err);
    return res.render('register', { error: 'Registration failed. Try again.', success: null, username: req.body?.username || '' });
  }
});

module.exports = router;