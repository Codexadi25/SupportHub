const Category = require('../models/Category');
const Log = require('../models/Log');
const User = require('../models/User');
const Feedback = require('../models/Feedback');
const { getOnlineUsers, getAllUserStatuses, getUserStatusCounts } = require('../utils/webSocketServer');
const Logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// @desc    Bulk upload canned responses from JSON file
// @route   POST /api/admin/bulk-upload-cands
// @access  Admin/Vendor
async function bulkUploadCands(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const jsonData = JSON.parse(req.file.buffer.toString());
        const { mode } = req.body;

        if (mode === 'replace') {
            await Category.deleteMany({});
        }

        let createdCount = 0;
        for (const categoryData of jsonData.categories) {
            const category = new Category({
                title: categoryData.title,
                templates: categoryData.templates
            });
            await category.save();
            createdCount += categoryData.templates.length;
        }

        // No need to broadcast for canned responses
        res.json({ 
            message: `Successfully ${mode === 'replace' ? 'replaced' : 'added'} ${createdCount} canned responses`,
            count: createdCount
        });
    } catch (error) {
        console.error('Bulk upload error:', error);
        res.status(500).json({ error: 'Failed to upload canned responses' });
    }
}

// @desc    Get system logs
// @route   GET /api/admin/logs
// @access  Admin/Vendor
async function getLogs(req, res) {
    try {
        const logs = await Log.find({}).sort({ createdAt: -1 }).limit(1000);
        res.json(logs);
    } catch (error) {
        console.error('Get logs error:', error);
        res.status(500).json({ error: 'Failed to retrieve logs' });
    }
}

// @desc    Cleanup old logs
// @route   POST /api/admin/cleanup-logs
// @access  Admin/Vendor
async function cleanupLogs(req, res) {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const result = await Log.deleteMany({ createdAt: { $lt: thirtyDaysAgo } });
        
        res.json({ 
            message: `Cleaned up ${result.deletedCount} old log entries`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Cleanup logs error:', error);
        res.status(500).json({ error: 'Failed to cleanup logs' });
    }
}

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Admin
async function getUsers(req, res) {
    try {
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to retrieve users' });
    }
}

// @desc    Update user role
// @route   PUT /api/admin/users/:id/role
// @access  Admin
async function updateUserRole(req, res) {
    try {
        const { role } = req.body;
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        user.role = role;
        await user.save();
        
        // User role updated
        res.json({ message: 'User role updated successfully' });
    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({ error: 'Failed to update user role' });
    }
}

// @desc    Update user password
// @route   PUT /api/admin/users/:id/password
// @access  Admin
async function updateUserPassword(req, res, next) {
    try {
        const { newPassword } = req.body;
        
        // if (!password || password.trim() === '') {
        if (!newPassword || newPassword.trim() === '') {
            res.status(400); // 400 = Bad Request
            throw new Error('Password is required');
        }

        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        user.password = newPassword;
        // user.password = password; // Pre-save hook will hash it
        await user.save();
        
        res.json({ message: 'User password updated successfully' });
    } catch (error) {
        console.error('Update user password error:', error);
        next(error);
    }
}

// @desc    Reset user password to username
// @route   POST /api/admin/users/:id/reset-password
// @access  Admin
async function resetUserPassword(req, res) {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        user.password = user.username; // Reset to username
        await user.save();
        
        res.json({ 
            message: 'User password reset successfully',
            newPassword: user.username
        });
    } catch (error) {
        console.error('Reset user password error:', error);
        res.status(500).json({ error: 'Failed to reset user password' });
    }
}

// @desc    Delete a user
// @route   DELETE /api/admin/users/:id
// @access  Admin
async function deleteUser(req, res) {
    try {
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.role === 'admin') {
            return res.status(400).json({ error: 'Cannot delete an admin account' });
        }
        
        await user.deleteOne();
        // User deleted
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
}

// @desc    Bulk create users
// @route   POST /api/admin/users/bulk
// @access   Admin/Vendor
async function bulkCreateUsers(req, res) {
    try {
        const { usernames } = req.body;
        
        if (!usernames || !Array.isArray(usernames)) {
            return res.status(400).json({ error: 'Invalid input: "usernames" array is required' });
        }

        const createdUsers = [];
        const failedUsers = [];

        for (const username of usernames) {
            const cleanUsername = username.trim();
            if (cleanUsername) {
                const userExists = await User.findOne({ username: cleanUsername });
                if (!userExists) {
                    const newUser = new User({ 
                        username: cleanUsername, 
                        password: cleanUsername 
                    });
                    await newUser.save();
                    createdUsers.push({ 
                        username: newUser.username, 
                        password: cleanUsername 
                    });
                } else {
                    failedUsers.push({ 
                        username: cleanUsername, 
                        reason: 'Already exists' 
                    });
                }
            }
        }

        // Users bulk created
        res.json({
            message: 'Bulk user creation process completed',
            createdUsers,
            failedUsers
        });
    } catch (error) {
        console.error('Bulk create users error:', error);
        res.status(500).json({ error: 'Failed to create users' });
    }
}

// @desc    Delete a feedback entry
// @route   DELETE /api/admin/feedback/:id
// @access  Admin/Vendor
async function deleteFeedback(req, res) {
    try {
        const { id } = req.params;
        const deleted = await Feedback.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ error: 'Feedback not found' });
        }
        return res.status(200).json({ message: 'Feedback deleted' });
    } catch (err) {
        console.error('Error deleting feedback:', err);
        return res.status(500).json({ error: 'Error deleting feedback' });
    }
}

// @desc    Delete a comment entry
// @route   DELETE /api/admin/comments/:id
// @access  Admin/Vendor
async function deleteComment(req, res) {
    try {
        const { id } = req.params;
        // Find feedback that contains the comment
        const feedback = await Feedback.findOne({ 'comments._id': id });
        if (!feedback) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        
        // Remove the comment from the feedback
        feedback.comments.pull({ _id: id });
        await feedback.save();
        
        return res.status(200).json({ message: 'Comment deleted' });
    } catch (err) {
        console.error('Error deleting comment:', err);
        return res.status(500).json({ error: 'Error deleting comment' });
    }
}

// @desc    Get user activity statistics
// @route   GET /api/admin/user-activity-stats
// @access  Admin
async function getUserActivityStats(req, res) {
    try {
        const users = await getAllUserStatuses();
        const counts = await getUserStatusCounts();
        res.json({ success: true, data: { users, counts } });
    } catch (error) {
        console.error('Get user activity stats error:', error);
        res.status(500).json({ error: 'Failed to retrieve user activity stats' });
    }
}

// @desc    Get user activity logs
// @route   GET /api/admin/user-activity-logs
// @access  Admin
async function getUserActivityLogs(req, res) {
    try {
        const logs = await Log.find({ 
            action: { $in: ['login', 'logout', 'activity'] }
        }).sort({ createdAt: -1 }).limit(100);
        
        const formattedLogs = logs.map(log => ({
            username: log.username,
            role: log.user?.role || 'unknown',
            action: log.action,
            timestamp: log.createdAt,
            timeAgo: getTimeAgo(log.createdAt),
            status: log.action === 'login' ? 'online' : 'offline'
        }));
        
        res.json({ 
            success: true, 
            data: { logs: formattedLogs } 
        });
    } catch (error) {
        console.error('Get user activity logs error:', error);
        res.status(500).json({ error: 'Failed to retrieve user activity logs' });
    }
}

function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
}

module.exports = {
    bulkUploadCands,
    getLogs,
    getUsers,
    updateUserRole,
    deleteUser,
    cleanupLogs,
    updateUserPassword,
    resetUserPassword,
    bulkCreateUsers,
    deleteFeedback,
    deleteComment,
    getUserActivityStats,
    getUserActivityLogs,
};