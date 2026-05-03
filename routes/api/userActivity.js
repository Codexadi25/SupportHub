const express = require('express');
const router = express.Router();
const { getAllUserStatuses, getUserStatusCounts, getOnlineUsers } = require('../../utils/webSocketServer');
const { isAuthenticated, isVendorOrAdmin } = require('../../middleware/authMiddleware');

// GET /api/user-activity — All users with their current status (admin/vendor only)
router.get('/user-activity', isAuthenticated, isVendorOrAdmin, async (req, res) => {
    try {
        const users = await getAllUserStatuses();
        res.json({ success: true, data: users });
    } catch (error) {
        console.error('Error fetching user activity:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch user activity' });
    }
});

// GET /api/user-activity/counts — Status count summary (admin/vendor only)
router.get('/user-activity/counts', isAuthenticated, isVendorOrAdmin, async (req, res) => {
    try {
        const counts = await getUserStatusCounts();
        res.json({ success: true, data: counts });
    } catch (error) {
        console.error('Error fetching user counts:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch user counts' });
    }
});

// GET /api/user-activity/online — Just the currently-connected users (admin/vendor only)
router.get('/user-activity/online', isAuthenticated, isVendorOrAdmin, async (req, res) => {
    try {
        const users = getOnlineUsers();
        res.json({ success: true, data: users, count: users.length });
    } catch (error) {
        console.error('Error fetching online users:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch online users' });
    }
});

// GET /api/user-status/:userId — Status for a specific user
router.get('/user-status/:userId', isAuthenticated, async (req, res) => {
    try {
        const online = getOnlineUsers();
        const user = online.find(u => u.userId === req.params.userId);
        if (user) {
            res.json({ userId: req.params.userId, status: user.status, lastActivity: user.lastActivity });
        } else {
            res.json({ userId: req.params.userId, status: 'unavailable', lastActivity: null });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user status' });
    }
});

module.exports = router;
