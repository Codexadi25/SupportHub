const User = require('../models/User');
const Logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');
const generateToken = require('../utils/generateToken');

// @desc    Register new user
// @route   POST /api/auth/register
exports.registerUser = asyncHandler(async (req, res) => {
    const { username, password, confirmPassword } = req.body;

    if (!username || !password || !confirmPassword) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
    }

    const user = await User.create({
        username: username.toLowerCase(),
        password,
        role: 'new' // Default role
    });

    await Logger.logInfo(`New user registered: ${user.username}`, {
        user: user._id,
        username: user.username,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        action: 'REGISTER',
        resource: 'User'
    });

    res.status(201).json({ 
        message: 'Registration successful! Please login with your credentials.' 
    });
});

// @desc    Authenticate user
// @route   POST /api/auth/login
exports.loginUser = asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username.toLowerCase() });

    if (user && (await user.matchPassword(password))) {
        const token = generateToken(res, user._id, user.username, user.role);
        res.json({
            _id: user._id,
            username: user.username,
            role: user.role,
            token: token
        });
    } else {
        res.status(401).json({ message: 'Invalid username or password' });
    }
});

// @desc    Logout user
// @route   POST /api/auth/logout
exports.logoutUser = (req, res) => {
    res.json({ message: 'Logged out successfully' });
};

// @desc    Get user data
// @route   GET /api/auth/user
exports.getUser = asyncHandler(async (req, res) => {
    if (req.user) {
        res.json({
            _id: req.user._id,
            username: req.user.username,
            role: req.user.role,
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
});
