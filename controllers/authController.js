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
    
    const reasonMessages = {
        single_device: 'You have been logged out because your account was logged in from another device.',
        account_deactivated: 'Your account has been deactivated by an administrator.',
        role_changed: 'Your role or access privileges have been modified. Please login again to apply changes.',
        inactivity: 'You have been logged out due to inactivity.',
        session_expired: 'Your session has expired. Please login again.',
        forced: 'An administrator has terminated your session.'
    };

    if (reason && reasonMessages[reason]) {
        error = reasonMessages[reason];
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

    // Username validation: Alphanumeric and underscores only
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
        return res.render('register', { error: 'Username can\'t contain special character except "_underscore_"', success: null });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
        return res.render('register', { error: 'Username already exists', success: null });
    }
    
    try {
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
    } catch (error) {
        if (error.code === 11000 || (error.name === 'MongoServerError' && error.message.includes('E11000'))) {
            return res.render('register', { error: 'Username already exists', success: null });
        }
        throw error;
    }
});

// @desc    Authenticate user & get token
// @route   POST /auth/login
exports.loginUser = async (req, res) => {
    const { username, password } = req.body;
    try {
        // Strict Username Check: Alphanumeric and underscores only
        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (username && !usernameRegex.test(username)) {
            return res.render('login', { 
                error: 'Invalid username or password or the ID has been terminated due to new new security guidelines after 30-May-2026. Kindly create a fresh account.', 
                success: null 
            });
        }

        const user = await User.findOne({ username: username.toLowerCase() });

        if (user && (await user.matchPassword(password))) {
            // Check if account is already logged in on another device
            if (user.currentSessionId && user.currentSessionId !== req.sessionID) {
                const lastActive = user.lastActiveAt || user.updatedAt || user.createdAt;
                const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
                if (lastActive && lastActive < twoHoursAgo) {
                    user.currentSessionId = '';
                    user.lastActiveIp = '';
                    await user.save();
                } else {
                    const { step } = req.body;
                    if (step !== 'confirm_logout') {
                        // Prompt about active session on another device and allow termination or report
                        return res.render('login', {
                            error: null,
                            success: null,
                            isDuplicateSession: true,
                            step: 'warn_duplicate',
                            formData: { username, password }
                        });
                    }
                }
            }

            // Update session tracking and IP in database
            user.currentSessionId = req.sessionID;
            user.lastActiveIp = req.ip || req.connection.remoteAddress;
            user.lastActiveAt = new Date();
            await user.save();

            // Create session — include all user attributes
            req.session.user = {
                id: user._id.toString(),
                _id: user._id.toString(),
                username: user.username,
                role: user.role,
                department: user.department || 'general',
                email: user.email || '',
                profilePic: user.profilePic || '',
                image: user.image || '',
                fontSize: user.fontSize || 'medium',
                uiColor: user.uiColor || '#2563eb',
                nightMode: user.nightMode || false,
                profileName: user.profileName || '',
                displayName: user.displayName || '',
                bgColor: user.bgColor || '',
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
    
    // Clear currentSessionId in user model if user is logged in
    if (req.session.user) {
        try {
            const user = await User.findById(req.session.user.id || req.session.user._id);
            if (user) {
                user.currentSessionId = '';
                await user.save();
            }
        } catch (err) {
            console.error('Failed to clear currentSessionId on logout:', err);
        }
    }

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

// @desc    Report unauthorized access
// @route   POST /auth/report-unauthorized
exports.reportUnauthorized = asyncHandler(async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required' });
    }
    
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Log the security alert to admin using exact required message format
    await Logger.logInfo(`SECURITY ALERT: Unauthorized session reported for ${user.username}`, {
        user: user._id,
        username: user.username,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        action: 'SECURITY_ALERT',
        resource: 'User'
    });
    
    res.json({ success: true, message: 'Security alert successfully recorded.' });
});

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

        if (userDoc.role === 'admin') {
            // Admin sees ALL notes (public & private from everyone)
            privateNotesQuery = { lob: userLob };
        } else if (userDoc.role === 'new') {
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
        
        // Resolve dynamic SOP URL
        let sopUrl = '';
        if (userDoc.role === 'admin') {
            sopUrl = '/sop';
        } else {
            const { SopTemplate } = require('../models/Sop');
            const template = await SopTemplate.findOne({ lob: new RegExp(`^${userLob}$`, 'i') });
            const parentDept = template?.department || 'zomato';
            const modeSegment = ['admin', 'quality_analyst', 'editor'].includes(userDoc.role) ? 'edit' : 'view';
            sopUrl = `/${parentDept}/${userLob}/sop/${modeSegment}`;
        }
        
        // Render the main page with all the necessary data
        res.render('index', {
            categories: categories,
            privateNotes: privateNotes,
            allTags: [...allTags].sort(),
            user: userDoc,
            users: users,
            sopUrl: sopUrl
        });
    } catch (error) {
        console.error("Error loading application page:", error);
        res.status(500).send("Could not load application data. Please try again later.");
    }
};
