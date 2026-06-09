const express = require('express');
const router = express.Router({ mergeParams: true });
const Message = require('../../models/Message');
const User = require('../../models/User');
const { isAuthenticated, isBroadcaster, isAdmin } = require('../../middleware/authMiddleware');

// Get messages for current user
router.get('/my', isAuthenticated, async (req, res) => {
    try {
        const user = req.session.user;
        const messages = await Message.find({ isActive: true, lob: req.params.lob })
            .sort({ priority: -1, createdAt: -1 });
        
        // Filter messages that should be shown to this user
        const userMessages = messages.filter(message => message.shouldShowToUser(user));
        
        res.json(userMessages);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching messages', error: error.message });
    }
});

// Mark message as read
router.post('/:id/read', isAuthenticated, async (req, res) => {
    try {
        const message = await Message.findOne({ _id: req.params.id, lob: req.params.lob });
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }
        
        // Check if already read
        const sessionUser = req.session.user || {};
        const currentUserId = sessionUser._id || sessionUser.id;
        const alreadyRead = message.isRead.find(read => String(read.userId) === String(currentUserId));
        if (!alreadyRead) {
            message.isRead.push({
                userId: currentUserId,
                readAt: new Date()
            });
            await message.save();
        }
        
        res.json({ message: 'Message marked as read' });
    } catch (error) {
        res.status(400).json({ message: 'Error marking message as read', error: error.message });
    }
});

// Get all messages (vendor/admin view logs per matrix? Keep admin only)
router.get('/', isAuthenticated, async (req, res) => {
    if (req.session.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    try {
        const { page = 1, limit = 20, type, priority } = req.query;
        const filter = { lob: req.params.lob };
        
        if (type) filter.type = type;
        if (priority) filter.priority = priority;
        
        const messages = await Message.find(filter)
            .populate('authorId', 'username')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const total = await Message.countDocuments(filter);
        
        res.json({
            messages,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching messages', error: error.message });
    }
});

// Create new message (team_lead, quality_analyst, vendor, admin)
router.post('/', isAuthenticated, isBroadcaster, async (req, res) => {
    try {
        const {
            title,
            content,
            targetUsers = [],
            targetRoles = ['all'],
            priority = 'medium',
            type = 'info',
            endDate,
            contentType = 'plain'
        } = req.body;
        
        if (!endDate) {
            return res.status(400).json({ message: 'End date is required' });
        }
        
        const sessionUser = req.session.user || {};
        const currentUserId = sessionUser._id || sessionUser.id;
        const message = new Message({
            title,
            content,
            authorId: currentUserId,
            authorName: sessionUser.username,
            targetUsers,
            targetRoles,
            priority,
            type,
            endDate: new Date(endDate),
            lob: req.params.lob,
            contentType
        });
        
        await message.save();
        res.status(201).json({ message: 'Message created successfully', data: message });
    } catch (error) {
        res.status(400).json({ message: 'Error creating message', error: error.message });
    }
});

// Update message (team_lead or above)
router.put('/:id', isAuthenticated, isBroadcaster, async (req, res) => {
    try {
        const {
            title,
            content,
            targetUsers,
            targetRoles,
            priority,
            type,
            endDate,
            isActive,
            contentType
        } = req.body;
        
        const message = await Message.findOne({ _id: req.params.id, lob: req.params.lob });
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }
        
        if (title) message.title = title;
        if (content) message.content = content;
        if (targetUsers) message.targetUsers = targetUsers;
        if (targetRoles) message.targetRoles = targetRoles;
        if (priority) message.priority = priority;
        if (type) message.type = type;
        if (endDate) message.endDate = new Date(endDate);
        if (isActive !== undefined) message.isActive = isActive;
        if (contentType) message.contentType = contentType;
        
        await message.save();
        res.json({ message: 'Message updated successfully', data: message });
    } catch (error) {
        res.status(400).json({ message: 'Error updating message', error: error.message });
    }
});

// Delete message (team_lead or above per matrix delete messages)
router.delete('/:id', isAuthenticated, isBroadcaster, async (req, res) => {
    try {
        const message = await Message.findOneAndDelete({ _id: req.params.id, lob: req.params.lob });
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }
        res.json({ message: 'Message deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: 'Error deleting message', error: error.message });
    }
});

// Get all users for targeting (admin only)
router.get('/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const users = await User.find({}, 'username role');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
});

// Cleanup expired messages (admin only)
router.post('/cleanup', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const result = await Message.deleteMany({
            endDate: { $lt: new Date() },
            lob: req.params.lob
        });
        res.json({ message: `Cleaned up ${result.deletedCount} expired messages` });
    } catch (error) {
        res.status(500).json({ message: 'Error cleaning up messages', error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// System: Broadcast a version update notification to ALL users (admin only)
// Called automatically by the CI deploy script after each push.
// POST /api/:lob/messages/broadcast-update
// Body: { version, changelog: string[], secret } 
// ─────────────────────────────────────────────────────────────────────────────
router.post('/broadcast-update', async (req, res) => {
    try {
        const { version, changelog = [], secret } = req.body;

        // Validate deploy secret (must match DEPLOY_SECRET env var)
        const deploySecret = process.env.DEPLOY_SECRET || '';
        if (!deploySecret || secret !== deploySecret) {
            return res.status(403).json({ message: 'Forbidden: invalid deploy secret' });
        }

        if (!version) {
            return res.status(400).json({ message: 'version is required' });
        }

        // Find an admin user to use as the author
        const adminUser = await User.findOne({ role: 'admin' }).select('_id username');
        if (!adminUser) {
            return res.status(500).json({ message: 'No admin user found to author the broadcast' });
        }

        const changelogText = Array.isArray(changelog) && changelog.length
            ? changelog.map(line => `• ${line}`).join('\n')
            : 'See the version history modal for full details.';

        const title   = `🚀 SupportHub updated to ${version}`;
        const content = `A new version of SupportHub (${version}) has been released.\n\n${changelogText}\n\nClick the version tag in the footer to view the full changelog.`;

        // Expire in 7 days
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);

        const message = new Message({
            title,
            content,
            authorId  : adminUser._id,
            authorName: 'SupportHub System',
            targetRoles: ['all'],
            priority  : 'high',
            type      : 'update',
            isActive  : true,
            endDate,
            lob       : req.params.lob
        });

        await message.save();
        res.status(201).json({ message: 'Update notification broadcast successfully', data: message });
    } catch (error) {
        res.status(500).json({ message: 'Error broadcasting update', error: error.message });
    }
});

module.exports = router;

