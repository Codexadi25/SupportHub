const Category = require('../models/Category');
const Log = require('../models/Log');
const User = require('../models/User');
const Team = require('../models/Team');
const Feedback = require('../models/Feedback');
const Department = require('../models/Department');
const Notification = require('../models/Notification');
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

// @desc    Get users (admin sees all; TL/QA/Editor see their own department)
// @route   GET /api/admin/users
// @access  UserManager roles
async function getUsers(req, res) {
    try {
        const requestingRole = req.session?.user?.role;
        const DEPT_SCOPED_ROLES = ['team_lead', 'quality_analyst', 'editor'];
        let query = {};
        if (DEPT_SCOPED_ROLES.includes(requestingRole)) {
            const dept = req.session?.user?.department || 'general';
            query = { department: dept };
        }
        const users = await User.find(query).select('-password');
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to retrieve users' });
    }
}

// @desc    Update user role
// @route   PUT /api/admin/users/:id/role
// @access  Admin/Vendor/TeamLead
async function updateUserRole(req, res) {
    try {
        const reqRole = req.session?.user?.role || req.user?.role;
        const reqDept = (req.session?.user?.department || '').toLowerCase().trim();
        if (!['admin', 'vendor', 'team_lead'].includes(reqRole)) {
            return res.status(403).json({ error: 'Forbidden: Only Team Leaders, Admins, and Vendors can update departments or roles.' });
        }

        const { role, department, teamId } = req.body;
        const user = await User.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Handle team alignment
        if (teamId !== undefined) {
            const targetTeam = teamId && teamId !== 'none' && teamId !== 'null' ? await Team.findById(teamId) : null;
            
            if (teamId && teamId !== 'none' && teamId !== 'null' && !targetTeam) {
                return res.status(404).json({ error: 'Target team not found' });
            }

            if (reqRole === 'team_lead') {
                if (targetTeam) {
                    const targetTeamDept = (targetTeam.department || '').toLowerCase().trim();
                    if (targetTeamDept !== reqDept) {
                        // Different department: check if target team has a team lead assigned
                        if (!targetTeam.teamLeadId) {
                            return res.status(400).json({ error: 'Forbidden: Moving a user under a different department is only allowed if the target team has an assigned Team Lead.' });
                        }
                    }
                } else {
                    // Clearing alignment
                    const userDept = (user.department || '').toLowerCase().trim();
                    if (userDept && userDept !== 'none' && userDept !== reqDept) {
                        return res.status(400).json({ error: 'Forbidden: Cannot clear team alignment for users in different departments.' });
                    }
                }
            }

            // If alignment changed
            const oldTeamId = user.teamId;
            if (String(oldTeamId) !== String(targetTeam ? targetTeam._id : null)) {
                if (oldTeamId) {
                    await Team.updateOne({ _id: oldTeamId }, { $pull: { members: user._id } });
                }
                if (targetTeam) {
                    await Team.updateOne({ _id: targetTeam._id }, { $addToSet: { members: user._id } });
                    user.teamId = targetTeam._id;
                    user.department = targetTeam.department;
                } else {
                    user.teamId = null;
                }
            }
        }
        
        if (role) {
            user.role = role;
            if (role === 'team_lead') {
                let teamObj = await Team.findOne({ teamLeadId: user._id, organization: user.organization });
                if (!teamObj) {
                    teamObj = new Team({
                        name: (user.displayName || user.username) + ' Team',
                        teamLeadId: user._id,
                        organization: user.organization,
                        department: user.department || 'general',
                        isActive: true
                    });
                    await teamObj.save();
                } else if (!teamObj.isActive) {
                    teamObj.isActive = true;
                    await teamObj.save();
                }
            } else {
                await Team.updateMany({ teamLeadId: user._id }, { isActive: false });
            }
        }
        if (department !== undefined && teamId === undefined) {
            user.department = department.trim().toLowerCase() || 'general';
        }
        
        await user.save();

        if (user.role === 'team_lead') {
            await Team.updateMany({ teamLeadId: user._id }, { department: user.department });
        }

        // Create notification alert for role/department update
        try {
            await Notification.create({
                title: 'Access or Role Modified',
                content: `Your profile settings were modified by an administrator. Role: "${user.role}", Department: "${user.department}".`,
                type: 'role_change',
                recipientId: user._id,
                lob: (user.department || 'zomato').toLowerCase().trim()
            });
        } catch (notifErr) {
            console.error('[Notification Trigger] Failed to create role change notification:', notifErr);
        }
        
        res.json({ message: 'User updated successfully' });
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

        // Create notification alert for password change
        try {
            await Notification.create({
                title: 'Password Updated',
                content: 'Your account password has been updated/changed by an administrator.',
                type: 'password_change',
                recipientId: user._id,
                lob: (user.department || 'zomato').toLowerCase().trim()
            });
        } catch (notifErr) {
            console.error('[Notification Trigger] Failed to create password update notification:', notifErr);
        }
        
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

        // Create notification alert for password reset
        try {
            await Notification.create({
                title: 'Password Reset',
                content: `Your password has been reset to your username by an administrator. Please log in and change it.`,
                type: 'password_change',
                recipientId: user._id,
                lob: (user.department || 'zomato').toLowerCase().trim()
            });
        } catch (notifErr) {
            console.error('[Notification Trigger] Failed to create password reset notification:', notifErr);
        }
        
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
        const usernameRegex = /^[a-zA-Z0-9_]+$/;

        for (const username of usernames) {
            const cleanUsername = username.trim();
            if (cleanUsername) {
                if (!usernameRegex.test(cleanUsername)) {
                    failedUsers.push({ 
                        username: cleanUsername, 
                        reason: 'Username contains invalid special characters. Only alphanumeric and underscores allowed.' 
                    });
                    continue;
                }
                const userExists = await User.findOne({ username: cleanUsername });
                if (!userExists) {
                    try {
                        const newUser = new User({ 
                            username: cleanUsername, 
                            password: cleanUsername 
                        });
                        await newUser.save();
                        createdUsers.push({ 
                            username: newUser.username, 
                            password: cleanUsername 
                        });
                    } catch (err) {
                        if (err.code === 11000 || (err.name === 'MongoServerError' && err.message.includes('E11000'))) {
                            failedUsers.push({ 
                                username: cleanUsername, 
                                reason: 'Already exists' 
                            });
                        } else {
                            failedUsers.push({
                                username: cleanUsername,
                                reason: err.message
                            });
                        }
                    }
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

// @desc    Get user activity statistics (data sourced from Firebase RTDB on client side)
// @route   GET /api/admin/user-activity-stats
// @access  Admin
async function getUserActivityStats(req, res) {
    try {
        // Activity tracking is handled via Firebase RTDB on the client.
        // This endpoint now returns a lightweight stub for server-side compatibility.
        const totalUsers = await User.countDocuments();
        res.json({ success: true, data: { total: totalUsers, note: 'Live presence via Firebase RTDB' } });
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

/**
 * Updates the global theme for a specific Line of Business (LOB)
 *
 */
exports.updateTheme = async (req, res) => {
    const { lob } = req.params;
    const { primaryColor, secondaryColor } = req.body;

    if (req.user.role !== 'Admin') return res.status(403).send("Forbidden");

    try {
        await Theme.findOneAndUpdate(
            { lob: lob },
            { primaryColor, secondaryColor },
            { upsert: true, new: true }
        );
        
        // Audit the change
        await Audit.create({
            action: 'Theme Update',
            details: `Colors updated for ${lob}: Primary ${primaryColor}`,
            user: req.user.username
        });

        res.redirect(`/${lob}/sop/admin-settings`);
    } catch (err) {
        res.status(500).send(err.message);
    }
};

// @desc    Get all departments
// @route   GET /api/admin/departments
// @access  UserManager roles
async function getDepartments(req, res) {
    try {
        const depts = await Department.find({ isActive: true }).sort({ name: 1 });
        res.json(depts);
    } catch (error) {
        console.error('Get departments error:', error);
        res.status(500).json({ error: 'Failed to retrieve departments' });
    }
}

// @desc    Create new department
// @route   POST /api/admin/departments
// @access  Admin only
async function createDepartment(req, res) {
    try {
        const reqRole = req.session?.user?.role || req.user?.role;
        if (reqRole !== 'admin') {
            return res.status(403).json({ error: 'Forbidden: Only administrators can create departments.' });
        }
        
        const { name, description } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Department name is required' });
        }
        
        const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const existing = await Department.findOne({ slug });
        if (existing) {
            return res.status(400).json({ error: 'A department with this name/slug already exists.' });
        }
        
        const dept = await Department.create({
            name: name.trim(),
            slug,
            description: description || '',
            createdBy: req.session?.user?.id || null
        });
        
        res.status(201).json(dept);
    } catch (error) {
        console.error('Create department error:', error);
        res.status(500).json({ error: 'Failed to create department' });
    }
}

// @desc    Get all teams with populated TL names
// @route   GET /api/admin/teams
// @access  UserManager roles
async function getTeams(req, res) {
    try {
        const teams = await Team.find({ isActive: true })
            .populate('teamLeadId', 'username profileName displayName')
            .sort({ name: 1 })
            .lean();
        teams.forEach(t => {
            if (t.teamLeadId) {
                t.name = (t.teamLeadId.displayName || t.teamLeadId.username) + ' Team';
            }
        });
        res.json(teams);
    } catch (error) {
        console.error('Get teams error:', error);
        res.status(500).json({ error: 'Failed to retrieve teams' });
    }
}

// @desc    Sync permitted words from existing DB canned responses
// @route   POST /api/admin/sync-permitted-words
// @access  Admin/Vendor
async function syncPermittedWords(req, res) {
    try {
        const wordManager = require('../utils/permittedWordManager');
        const stats = await wordManager.syncWordsFromDatabase();
        res.json({
            success: true,
            message: `Successfully synchronized permitted words. Created: ${stats.created}, Updated: ${stats.updated}`,
            stats
        });
    } catch (error) {
        console.error('Sync permitted words error:', error);
        res.status(500).json({ error: 'Failed to sync permitted words' });
    }
}

// @desc    Get all permitted words
// @route   GET /api/admin/permitted-words
// @access  Admin/Vendor/TeamLead/QualityAnalyst/Editor
async function getPermittedWords(req, res) {
    try {
        const PermittedWord = require('../models/PermittedWord');
        const query = {};
        if (req.query.search) {
            query.word = { $regex: req.query.search.trim().toLowerCase(), $options: 'i' };
        }
        const words = await PermittedWord.find(query).sort({ word: 1 });
        res.json(words);
    } catch (error) {
        console.error('Get permitted words error:', error);
        res.status(500).json({ error: 'Failed to retrieve permitted words' });
    }
}

// @desc    Add manual permitted word
// @route   POST /api/admin/permitted-words
// @access  Admin/Vendor
async function addPermittedWord(req, res) {
    try {
        const PermittedWord = require('../models/PermittedWord');
        const wordManager = require('../utils/permittedWordManager');
        const { word } = req.body;
        if (!word || !word.trim()) {
            return res.status(400).json({ error: 'Word is required' });
        }
        const cleanWord = word.trim().toLowerCase();
        
        // Check if already exists
        const existing = await PermittedWord.findOne({ word: cleanWord });
        if (existing) {
            return res.status(400).json({ error: `Word "${cleanWord}" is already in the permitted list.` });
        }
        
        const similarWords = wordManager.getWordVariations(cleanWord);
        const newWord = await PermittedWord.create({
            word: cleanWord,
            similarWords,
            source: 'user_added',
            isActive: true
        });
        
        res.status(201).json({ success: true, data: newWord });
    } catch (error) {
        console.error('Add permitted word error:', error);
        res.status(500).json({ error: 'Failed to add permitted word' });
    }
}

// @desc    Delete permitted word
// @route   DELETE /api/admin/permitted-words/:id
// @access  Admin/Vendor
async function deletePermittedWord(req, res) {
    try {
        const PermittedWord = require('../models/PermittedWord');
        const deleted = await PermittedWord.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Word not found' });
        }
        res.json({ success: true, message: `Deleted word "${deleted.word}" successfully.` });
    } catch (error) {
        console.error('Delete permitted word error:', error);
        res.status(500).json({ error: 'Failed to delete permitted word' });
    }
}

module.exports = {
    bulkUploadCands,
    getLogs,
    getUsers,
    getTeams,
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
    getDepartments,
    createDepartment,
    syncPermittedWords,
    getPermittedWords,
    addPermittedWord,
    deletePermittedWord,
};