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
            // Create session — always include department
            req.session.user = {
                id: user._id.toString(),
                _id: user._id.toString(),
                username: user.username,
                role: user.role,
                department: user.department || 'general',
            };
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.render('login', { error: 'An error occurred during login. Please try again.', success: null });
                }
                res.redirect('/');
            });
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
// @access  Private
exports.getAppPage = async (req, res) => {
    try {
        const sessionUser = req.session.user;
        const userLob = (sessionUser.department || 'zomato').toLowerCase().trim();

        // Fetch all data needed for the UI, filtered by active LOB
        const categories = await Category.find({ lob: userLob }).sort({ title: 1 });
        
        // Fetch private notes respecting visibility rules and active LOB
        const ELEVATED_ROLES = ['admin', 'vendor', 'team_lead', 'quality_analyst', 'editor'];
        let privateNotesQuery;

        if (sessionUser.role === 'new') {
            // Restricted users only see their own notes
            privateNotesQuery = { user: sessionUser.id, lob: userLob };
        } else {
            // Everyone else sees public notes + their own private notes
            privateNotesQuery = {
                lob: userLob,
                $or: [
                    { visibility: 'public' },
                    { user: sessionUser.id }
                ]
            };
        }

        const privateNotes = await PrivateNote.find(privateNotesQuery).sort({ createdAt: -1 });

        // Admin sees ALL users; team_lead / quality_analyst / editor only see their own department
        const DEPT_SCOPED_ROLES = ['team_lead', 'quality_analyst', 'editor'];
        let userQuery = {};
        if (DEPT_SCOPED_ROLES.includes(sessionUser.role)) {
            userQuery = { department: sessionUser.department || 'general' };
        }
        const users = await User.find(userQuery).select('-password').sort({ username: 1 });

        // Aggregate all unique tags
        const allTags = new Set();
        if (categories && Array.isArray(categories)) {
            categories.forEach(cat => {
                if (cat.templates && Array.isArray(cat.templates)) {
                    cat.templates.forEach(tpl => {
                        if (tpl.tags && Array.isArray(tpl.tags)) {
                            tpl.tags.forEach(tag => allTags.add(tag));
                        }
                    });
                }
            });
        }
        
        // Render the main page with all the necessary data
        res.render('index', {
            categories: categories,
            privateNotes: privateNotes,
            allTags: [...allTags].sort(),
            user: req.session.user,
            users: users
        });
    } catch (error) {
        console.error("Error loading application page:", error);
        res.status(500).send("Could not load application data. Please try again later.");
    }
};
