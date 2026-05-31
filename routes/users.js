// lightweight route so client calls to /api/users/bulk remain supported
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const isAdmin = require('../middleware/isAdmin');
const { isAuthenticated } = require('../middleware/authMiddleware');
const User = require('../models/User');

// GET /api/users/profile -> Get current user settings & IP
router.get('/users/profile', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id || req.session.user._id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email || '',
                profilePic: user.profilePic || '',
                image: user.image || '',
                fontSize: user.fontSize || 'medium',
                uiColor: user.uiColor || '#2563eb',
                nightMode: user.nightMode || false,
                profileName: user.profileName || '',
                displayName: user.displayName || '',
                bgColor: user.bgColor || '',
                usernameLastChanged: user.usernameLastChanged || null,
                ip: req.ip || req.connection.remoteAddress || 'unknown'
            }
        });
    } catch (err) {
        console.error('Error fetching profile:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// PUT /api/users/profile -> Update user settings
router.put('/users/profile', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id || req.session.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const { username, email, profilePic, image, fontSize, uiColor, nightMode, profileName, displayName, bgColor } = req.body;
        const oldUsername = user.username;
        let usernameChanged = false;

        // If username is changing, check uniqueness and 14-day rate limit
        if (username && username.trim().toLowerCase() !== user.username) {
            const cleanUsername = username.trim().toLowerCase();
            
            // Username validation: Alphanumeric and underscores only
            const usernameRegex = /^[a-zA-Z0-9_]+$/;
            if (!usernameRegex.test(cleanUsername)) {
                return res.status(400).json({
                    success: false,
                    message: 'username cant contain special character except _'
                });
            }
            
            // Check 14-day limit
            if (user.usernameLastChanged) {
                const msSinceChange = Date.now() - new Date(user.usernameLastChanged).getTime();
                const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
                if (msSinceChange < fourteenDaysMs) {
                    const remainingMs = fourteenDaysMs - msSinceChange;
                    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
                    return res.status(400).json({
                        success: false,
                        message: `Username can only be changed once every 14 days. Please wait ${remainingDays} more day(s).`
                    });
                }
            }

            const existing = await User.findOne({ username: cleanUsername });
            if (existing) {
                return res.status(400).json({ success: false, message: 'Username already in use' });
            }

            user.username = cleanUsername;
            user.usernameLastChanged = new Date();
            usernameChanged = true;
        }

        if (email !== undefined) user.email = email.trim();
        if (profilePic !== undefined) {
            user.profilePic = profilePic;
            user.image = profilePic;
        }
        if (image !== undefined) user.image = image;
        if (fontSize !== undefined) user.fontSize = fontSize;
        if (uiColor !== undefined) user.uiColor = uiColor;
        if (nightMode !== undefined) user.nightMode = nightMode;
        if (profileName !== undefined) {
            user.profileName = profileName.trim();
            user.displayName = profileName.trim();
        }
        if (displayName !== undefined) user.displayName = displayName.trim();
        if (bgColor !== undefined) user.bgColor = bgColor.trim();

        await user.save();

        // Sync to session
        req.session.user.username = user.username;
        req.session.user.email = user.email;
        req.session.user.profilePic = user.profilePic;
        req.session.user.image = user.image;
        req.session.user.fontSize = user.fontSize;
        req.session.user.uiColor = user.uiColor;
        req.session.user.nightMode = user.nightMode;
        req.session.user.profileName = user.profileName;
        req.session.user.displayName = user.displayName;
        req.session.user.bgColor = user.bgColor;

        // Also sync profile updates to Firebase presence if active!
        try {
            const firebaseService = require('../services/firebaseService');
            const dept = (user.department || 'general').toLowerCase();
            const db = firebaseService.getDatabase();
            if (db) {
                // If username changed, remove the old presence node
                if (usernameChanged) {
                    await db.ref(`presence/${dept}/${oldUsername}`).remove();
                }
                await db.ref(`presence/${dept}/${user.username}`).update({
                    profilePic: user.image || user.profilePic || '',
                    image: user.image || '',
                    email: user.email || '',
                    profileName: user.profileName || '',
                    displayName: user.displayName || '',
                    bgColor: user.bgColor || ''
                });
            }
        } catch (firebaseErr) {
            console.warn('[Profile API] Non-critical Firebase sync warning:', firebaseErr.message);
        }

        req.session.save((err) => {
            if (err) {
                console.error('Session save error during profile update:', err);
                return res.status(500).json({ success: false, message: 'Failed to save session' });
            }
            res.json({
                success: true,
                message: 'Profile updated successfully',
                user: {
                    username: user.username,
                    email: user.email,
                    profilePic: user.profilePic,
                    image: user.image,
                    fontSize: user.fontSize,
                    uiColor: user.uiColor,
                    nightMode: user.nightMode,
                    profileName: user.profileName,
                    displayName: user.displayName,
                    bgColor: user.bgColor,
                    usernameLastChanged: user.usernameLastChanged
                }
            });
        });
    } catch (err) {
        console.error('Error updating profile:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// mount this router under /api in app.js to keep legacy client endpoints working:
// app.use('/api', require('./routes/users'));
router.post('/users/bulk', isAdmin, adminController.bulkCreateUsers);

module.exports = router;