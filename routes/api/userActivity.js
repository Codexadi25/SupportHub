const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../../middleware/authMiddleware');

/**
 * GET /api/user-activity/firebase-config
 * Returns Firebase RTDB config needed by the client to connect.
 * Requires authentication so anonymous users cannot pull the config.
 */
router.get('/user-activity/firebase-config', isAuthenticated, (req, res) => {
    res.json({
        success: true,
        config: {
            apiKey:            process.env.FIREBASE_API_KEY            || '',
            authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
            databaseURL:       process.env.FIREBASE_DATABASE_URL       || '',
            projectId:         process.env.FIREBASE_PROJECT_ID         || '',
            storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
            appId:             process.env.FIREBASE_APP_ID             || ''
        }
    });
});

module.exports = router;
