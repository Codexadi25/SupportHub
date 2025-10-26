const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer();
const adminController = require('../controllers/adminController');
const { isVendorOrAdmin, isUserManager } = require('../middleware/authMiddleware');
const { getUserActivityStats, disconnectUser } = require('../utils/webSocketServer');

// mount this router under /api/admin in app.js

// Cands bulk upload (multipart JSON file)
router.post('/bulk-upload-cands', isVendorOrAdmin, upload.single('jsonFile'), adminController.bulkUploadCands);

// Logs
router.get('/logs', isVendorOrAdmin, adminController.getLogs);
router.post('/cleanup-logs', isVendorOrAdmin, adminController.cleanupLogs);

// Users management (admin-only)
router.get('/users', isUserManager, adminController.getUsers);
router.put('/users/:id/role', isUserManager, adminController.updateUserRole);
router.put('/users/:id/password', isUserManager, adminController.updateUserPassword);
router.post('/users/:id/reset-password', isUserManager, adminController.resetUserPassword);
router.delete('/users/:id', isUserManager, adminController.deleteUser);

// Bulk create users (admin)
router.post('/users/bulk', isVendorOrAdmin, adminController.bulkCreateUsers);

// Feedback & Comments deletion endpoints (for frontend delete buttons)
// DELETE /api/admin/feedback/:id  -> delete a feedback entry
// DELETE /api/admin/comments/:id  -> delete a comment entry
router.delete('/feedback/:id', isVendorOrAdmin, adminController.deleteFeedback);
router.delete('/comments/:id', isVendorOrAdmin, adminController.deleteComment);

// Real-time user monitoring endpoints (admin-only)
router.get('/user-activity-stats', isUserManager, (req, res) => {
    try {
        const stats = getUserActivityStats();
        res.json({
            success: true,
            data: stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting user activity stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user activity statistics'
        });
    }
});

// Disconnect a specific user (admin-only)
router.post('/disconnect-user/:userId', isUserManager, (req, res) => {
    try {
        const { userId } = req.params;
        const success = disconnectUser(userId);
        
        if (success) {
            // Log the admin action
            console.log(`Admin ${req.session.user.username} disconnected user ${userId} at ${new Date().toISOString()}`);
            
            res.json({
                success: true,
                message: `User ${userId} has been disconnected`
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'User not found or already disconnected'
            });
        }
    } catch (error) {
        console.error('Error disconnecting user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to disconnect user'
        });
    }
});

// Get detailed user activity logs (admin-only)
router.get('/user-activity-logs', isUserManager, (req, res) => {
    try {
        const stats = getUserActivityStats();
        const logs = stats.recentActivity.map(activity => ({
            username: activity.username,
            role: activity.role,
            status: activity.status,
            lastActivity: new Date(activity.lastActivity).toISOString(),
            timeAgo: Math.round((Date.now() - activity.lastActivity) / 1000) + ' seconds ago'
        }));
        
        res.json({
            success: true,
            data: {
                logs,
                summary: {
                    total: stats.total,
                    online: stats.online,
                    idle: stats.idle,
                    byRole: stats.byRole
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting user activity logs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user activity logs'
        });
    }
});

module.exports = router;