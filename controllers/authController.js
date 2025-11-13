const User = require('../models/User');
const Category = require('../models/Category');
const PrivateNote = require('../models/PrivateNote');
const Logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');


// @desc    Show login page
// @route   GET /login
exports.getLoginPage = (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('login', { error: null, success: null, showRegister: true });
};

// @desc    Show registration page
// @route   GET /register
exports.getRegisterPage = (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('register', { error: null, success: null });
};

// @desc    Register new user
// @route   POST /auth/register
exports.registerUser = asyncHandler(async (req, res) => {
    const { username, password, confirmPassword } = req.body;
    
    // Validation
    if (!username || !password || !confirmPassword) {
        return res.render('register', { error: 'All fields are required', success: null });
    }
    
    if (password !== confirmPassword) {
        return res.render('register', { error: 'Passwords do not match', success: null });
    }
    
    if (password.length < 6) {
        return res.render('register', { error: 'Password must be at least 6 characters long', success: null });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
        return res.render('register', { error: 'Username already exists', success: null });
    }
    
    // Create new user with default 'user' role
    const user = await User.create({
        username: username.toLowerCase(),
        password,
        role: 'new' // Default role
    });
    
    // Log user registration
    await Logger.logInfo(`New user registered: ${user.username}`, {
        user: user._id,
        username: user.username,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        action: 'REGISTER',
        resource: 'User'
    });
    
    res.render('login', { 
        error: null, 
        success: 'Registration successful! Please login with your credentials.',
        showRegister: true 
    });
});

// @desc    Authenticate user & get token
// @route   POST /auth/login
exports.loginUser = async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username: username.toLowerCase() });

        if (user && (await user.matchPassword(password))) {
            // Create session
            req.session.user = {
                id: user._id,
                username: user.username,
                role: user.role,
            };
            res.redirect('/');
        } else {
            res.render('login', { error: 'Invalid username or password', success: null });
        }
    } catch (error) {
        res.render('login', { error: 'An error occurred. Please try again.', success: null });
    }
};

// @desc    Logout user
// @route   GET /auth/logout
exports.logoutUser = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid'); // The default session cookie name
        res.redirect('/login');
    });
};

// @desc    Show main application page
// @route   GET /
exports.getAppPage = async (req, res) => {
    try {
        // Fetch all data needed for the UI
        const categories = await Category.find().sort({ title: 1 });
        const privateNotes = await PrivateNote.find({ user: req.session.user.id }).sort({ createdAt: -1 });
        const users = await User.find({}).select('-password').sort({ username: 1 });
        
        // --- NEW: Fetch Private Note Categories ---
        const pnCategories = await Category.find({ user: req.session.user.id }).sort({ title: 1 });

        // Aggregate all unique tags
        const allTags = new Set();
        categories.forEach(cat => {
            cat.templates.forEach(tpl => {
                tpl.tags.forEach(tag => allTags.add(tag));
            });
        });
        
        // Render the main page with all the necessary data
        res.render('index', {
            categories: categories,
            privateNotes: privateNotes,
            pnCategories: pnCategories, // Pass PN categories to the template
            allTags: [...allTags].sort(),
            user: req.session.user,
            users: users
        });
    } catch (error) {
        console.error("Error loading application page:", error);
        res.status(500).send("Could not load application data. Please try again later.");
    }
};
