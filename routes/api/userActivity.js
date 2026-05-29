const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../../middleware/authMiddleware');
const User = require('../../models/User');
const { getDepartmentUsers, getUserActivityStats, getAllPresenceUsers } = require('../../services/firebaseService');

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

/**
 * GET /api/user-activity/department-users
 * Fetch all users in the caller's department
 * Combines MongoDB user data with Firebase presence status
 */
router.get('/user-activity/department-users', isAuthenticated, async (req, res) => {
    try {
        const department = (req.session.user?.department || 'general').toLowerCase();
        const role = req.session.user?.role;

        // Team leads and quality analysts can only see their own department
        // Admins can see all departments
        if (!['admin', 'team_lead', 'quality_analyst', 'editor', 'vendor'].includes(role)) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }

        // Fetch users from MongoDB
        let query = { role: { $ne: 'new' } };
        
        if (role !== 'admin') {
            query.department = department;
        }

        const dbUsers = await User.find(query).select('username role department').lean();

        // Fetch presence data from Firebase
        const firebaseUsers = (role === 'admin') ? await getAllPresenceUsers() : await getDepartmentUsers(department);

        // Merge data
        const mergedUsers = dbUsers.map(dbUser => {
            const fbUser = firebaseUsers.find(u => u.username === dbUser.username);
            return {
                ...dbUser,
                status: fbUser?.status || 'offline',
                lastUpdated: fbUser?.lastUpdated || fbUser?.ts || null,
                online: fbUser ? true : false
            };
        });

        res.json({
            success: true,
            department,
            users: mergedUsers,
            count: mergedUsers.length
        });
    } catch (error) {
        console.error('[UserActivity] Error fetching department users:', error);
        res.status(500).json({ success: false, message: 'Error fetching users' });
    }
});

/**
 * GET /api/user-activity/stats
 * Get activity statistics for a department
 */
router.get('/user-activity/stats', isAuthenticated, async (req, res) => {
    try {
        const department = (req.session.user?.department || 'general').toLowerCase();
        const stats = await getUserActivityStats(department);

        res.json({
            success: true,
            department,
            stats
        });
    } catch (error) {
        console.error('[UserActivity] Error fetching stats:', error);
        res.status(500).json({ success: false, message: 'Error fetching stats' });
    }
});

/**
 * GET /api/user-activity/all-departments
 * Get users from all departments (admin only)
 */
router.get('/user-activity/all-departments', isAuthenticated, async (req, res) => {
    try {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const allUsers = await User.find({ role: { $ne: 'new' } })
            .select('username role department')
            .lean();

        // Group by department
        const byDept = {};
        allUsers.forEach(user => {
            const dept = (user.department || 'general').toLowerCase();
            if (!byDept[dept]) byDept[dept] = [];
            byDept[dept].push(user);
        });

        res.json({
            success: true,
            departments: byDept,
            totalUsers: allUsers.length
        });
    } catch (error) {
        console.error('[UserActivity] Error fetching all departments:', error);
        res.status(500).json({ success: false, message: 'Error fetching departments' });
    }
});

module.exports = router;
