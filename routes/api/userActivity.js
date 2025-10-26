const express = require('express');
const router = express.Router();
const { getAllUserStatuses, getUserStatusCounts } = require('../../utils/webSocketServer');
const { isAuthenticated } = require('../../middleware/authMiddleware');

// GET /api/user-activity - Get all users with their current status
router.get('/user-activity', isAuthenticated, async (req, res) => {
    try {
        const users = await getAllUserStatuses();
        res.json({ success: true, data: users });
    } catch (error) {
        console.error('Error fetching user activity:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch user activity' });
    }
});

// GET /api/user-activity/counts - Get status counts
router.get('/user-activity/counts', isAuthenticated, async (req, res) => {
    try {
        const counts = await getUserStatusCounts();
        res.json({ success: true, data: counts });
    } catch (error) {
        console.error('Error fetching user counts:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch user counts' });
    }
});

module.exports = router;
