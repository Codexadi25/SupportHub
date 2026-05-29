const User = require('../models/User');
const Category = require('../models/Category');
const PrivateNote = require('../models/PrivateNote');
const Logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');
const { syncUserToFirebase } = require('../services/firebaseService');


// @desc    Show login page
// @route   GET /login
exports.getLoginPage = (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    const reason = req.query.reason;
    let error = null;
    if (reason === 'single_device') {
        error = 'You have been logged out because your account was logged in from another device.';
    }
    res.render('login', { error: error, success: null, showRegister: true });
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
            // Update session tracking and IP in database
            user.currentSessionId = req.sessionID;
            user.lastActiveIp = req.ip || req.connection.remoteAddress;
            await user.save();

            // Create session — always include department
            req.session.user = {
                id: user._id.toString(),
                _id: user._id.toString(),
                username: user.username,
                role: user.role,
                department: user.department || 'general',
            };
            
            // Sync user to Firebase Realtime Database (async, don't wait)
            syncUserToFirebase(user).catch(err => {
                console.error('[Auth] Firebase sync failed (non-critical):', err.message);
            });
            
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
        console.error('Login error:', error);
        res.render('login', { error: 'An error occurred. Please try again.', success: null });
    }
};

// @desc    Logout user
// @route   GET /auth/logout
exports.logoutUser = async (req, res) => {
    const username = req.session.user?.username;
    const department = req.session.user?.department || 'general';
    
    // Remove from Firebase (async, don't wait)
    if (username && department) {
        const { removeUserPresence } = require('../services/firebaseService');
        removeUserPresence(username, department).catch(err => {
            console.error('[Auth] Firebase presence removal failed (non-critical):', err.message);
        });
    }
    
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
        const userDoc = await User.findById(sessionUser.id || sessionUser._id);
        if (!userDoc) {
            return res.redirect('/auth/logout');
        }
        const userLob = (userDoc.department || 'zomato').toLowerCase().trim();

        // Fetch all data needed for the UI, filtered by active LOB
        const categories = await Category.find({ lob: userLob }).sort({ title: 1 });
        
        // Fetch private notes respecting visibility rules and active LOB
        const ELEVATED_ROLES = ['admin', 'vendor', 'team_lead', 'quality_analyst', 'editor'];
        let privateNotesQuery;

        if (userDoc.role === 'new') {
            // Restricted users only see their own notes
            privateNotesQuery = { user: userDoc._id, lob: userLob };
        } else {
            // Everyone else sees public notes + their own private notes
            privateNotesQuery = {
                lob: userLob,
                $or: [
                    { visibility: 'public' },
                    { user: userDoc._id }
                ]
            };
        }

        const privateNotes = await PrivateNote.find(privateNotesQuery).sort({ createdAt: -1 });

        // Admin sees ALL users; team_lead / quality_analyst / editor only see their own department
        const DEPT_SCOPED_ROLES = ['team_lead', 'quality_analyst', 'editor'];
        let userQuery = {};
        if (DEPT_SCOPED_ROLES.includes(userDoc.role)) {
            userQuery = { department: userDoc.department || 'general' };
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
            user: userDoc,
            users: users
        });
    } catch (error) {
        console.error("Error loading application page:", error);
        res.status(500).send("Could not load application data. Please try again later.");
    }
};
