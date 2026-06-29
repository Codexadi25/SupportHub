const express = require('express');
const router = express.Router({ mergeParams: true });
const Message = require('../../models/Message');
const User = require('../../models/User');
const { isAuthenticated, isBroadcaster, isAdmin } = require('../../middleware/authMiddleware');

// Get messages for current user
router.get('/my', isAuthenticated, async (req, res) => {
    try {
        const lob = req.params.lob;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const sessionUser = req.session.user;
        const dbUser = await User.findById(sessionUser._id || sessionUser.id);
        const clearedAt = dbUser && dbUser.clearedGroupChats ? dbUser.clearedGroupChats.get(lob) : null;

        let query = { lob: lob };
        if (clearedAt) {
            query.createdAt = { $gt: clearedAt };
        }

        // Group chat mode: fetch active or deleted messages for the LOB
        const messages = await Message.find(query)
            .populate('authorId', 'image profilePic')
            .sort({ priority: -1, createdAt: -1 }) // Newest first for pagination
            .skip(skip)
            .limit(limit);
        
        // Reverse back to chronological order for chat display
        messages.reverse();
        
        const userMessages = messages.filter(message => {
            if (message.isDeleted) return true;
            return message.shouldShowToUser(dbUser || sessionUser);
        }).map(msg => {
            const m = msg.toObject();
            if (msg.authorId && (msg.authorId.image || msg.authorId.profilePic)) {
                m.authorAvatar = msg.authorId.image || msg.authorId.profilePic;
            }
            return m;
        });
        
        res.json(userMessages);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching messages', error: error.message });
    }
});

// Clear group chat history for current user
router.delete('/my', isAuthenticated, async (req, res) => {
    try {
        const lob = req.params.lob;
        const sessionUser = req.session.user;
        const userId = sessionUser._id || sessionUser.id;
        
        const updateStr = `clearedGroupChats.${lob}`;
        await User.findByIdAndUpdate(userId, {
            $set: { [updateStr]: new Date() }
        });
        
        res.json({ message: 'Chat history cleared' });
    } catch (error) {
        res.status(500).json({ message: 'Error clearing chat', error: error.message });
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

// Get all messages (admin view logs)
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

// Create new message (any user for group chat)
router.post('/', isAuthenticated, async (req, res) => {
    try {
        const {
            title = 'Message', // Default title for chat
            content,
            targetUsers = [],
            targetRoles = ['all'],
            priority = 'medium',
            type = 'info',
            contentType = 'plain'
        } = req.body;
        
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

// Delete message (Soft delete by admin or author)
router.delete('/:id', isAuthenticated, async (req, res) => {
    try {
        const message = await Message.findOne({ _id: req.params.id, lob: req.params.lob });
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }
        
        const user = req.session.user;
        if (user.role !== 'admin' && String(message.authorId) !== String(user._id || user.id)) {
            return res.status(403).json({ message: 'Not authorized to delete this message' });
        }

        message.isDeleted = true;
        message.deletedBy = user.username;
        await message.save();

        res.json({ message: 'Message deleted successfully', data: message });
    } catch (error) {
        res.status(400).json({ message: 'Error deleting message', error: error.message });
    }
});

// Permanently delete message (admin only)
router.delete('/:id/permanent', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const message = await Message.findOneAndDelete({ _id: req.params.id, lob: req.params.lob });
        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }
        res.json({ message: 'Message permanently deleted' });
    } catch (error) {
        res.status(400).json({ message: 'Error permanently deleting message', error: error.message });
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

