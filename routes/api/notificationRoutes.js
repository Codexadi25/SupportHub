const express = require('express');
const router = express.Router({ mergeParams: true });
const Notification = require('../../models/Notification');
const { isAuthenticated } = require('../../middleware/authMiddleware');

// helper: check if user is an authorized broadcaster/creator
function isAuthorizer(req) {
    const role = req.session?.user?.role || req.user?.role;
    return ['admin', 'vendor', 'team_lead', 'quality_analyst'].includes(role);
}

// GET /api/:lob/notifications -> Retrieve notifications for the logged-in user
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const sessionUser = req.session.user || req.user || {};
        const userId = sessionUser._id || sessionUser.id;
        const userIdStr = String(userId);
        const userRole = sessionUser.role;
        const userDept = (sessionUser.department || 'general').toLowerCase().trim();
        const lob = req.params.lob.toLowerCase().trim();

        // Query targeted individual notifications, role-targeted, and department-targeted broadcast ones
        const query = {
            lob: lob,
            $or: [
                { recipientId: userId },
                { 
                    recipientId: null,
                    $and: [
                        { $or: [{ recipientRole: null }, { recipientRole: userRole }] },
                        { $or: [{ recipientDepartment: null }, { recipientDepartment: userDept }] }
                    ]
                }
            ]
        };

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(100);

        // Map notifications and determine read status for the current user
        const result = notifications.map(n => {
            const isRead = n.readBy.some(read => String(read.userId) === userIdStr);
            return {
                _id: n._id,
                title: n.title,
                content: n.content,
                contentType: n.contentType || 'plain',
                type: n.type,
                isRead,
                createdAt: n.createdAt
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications', error: error.message });
    }
});

// POST /api/:lob/notifications/:id/read -> Delete notification when marked as read
router.post('/:id/read', isAuthenticated, async (req, res) => {
    try {
        const lob = req.params.lob.toLowerCase().trim();
        const notif = await Notification.findOneAndDelete({ _id: req.params.id, lob });
        if (!notif) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        res.json({ success: true, message: 'Notification deleted on read' });
    } catch (error) {
        console.error('Error deleting notification read:', error);
        res.status(400).json({ message: 'Error deleting notification read', error: error.message });
    }
});

// POST /api/:lob/notifications/read-all -> Delete all matching notifications when marked as read
router.post('/read-all', isAuthenticated, async (req, res) => {
    try {
        const sessionUser = req.session.user || req.user || {};
        const userId = sessionUser._id || sessionUser.id;
        const userRole = sessionUser.role;
        const userDept = (sessionUser.department || 'general').toLowerCase().trim();
        const lob = req.params.lob.toLowerCase().trim();

        const query = {
            lob: lob,
            $or: [
                { recipientId: userId },
                { 
                    recipientId: null,
                    $and: [
                        { $or: [{ recipientRole: null }, { recipientRole: userRole }] },
                        { $or: [{ recipientDepartment: null }, { recipientDepartment: userDept }] }
                    ]
                }
            ]
        };

        const deleteResult = await Notification.deleteMany(query);
        res.json({ success: true, count: deleteResult.deletedCount });
    } catch (error) {
        console.error('Error deleting all notifications:', error);
        res.status(500).json({ message: 'Error deleting notifications', error: error.message });
    }
});

// POST /api/:lob/notifications -> Create custom notification (authorized users only)
router.post('/', isAuthenticated, async (req, res) => {
    try {
        if (!isAuthorizer(req)) {
            return res.status(403).json({ message: 'Forbidden: Insufficient permissions to dispatch notifications' });
        }

        const { title, content, type = 'custom', recipientId = null, recipientRole = null, recipientDepartment = null, contentType = 'plain' } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ message: 'Title and content are required' });
        }

        let targetRecipientId = recipientId;
        if (!targetRecipientId || targetRecipientId === 'all' || targetRecipientId === 'null') {
            targetRecipientId = null;
        }

        let targetType = type;
        if (targetType === 'other') targetType = 'custom';
        if (targetType === 'daily_briefing') targetType = 'briefing';

        const notif = new Notification({
            title,
            content,
            type: targetType,
            recipientId: targetRecipientId,
            recipientRole,
            recipientDepartment,
            lob: req.params.lob,
            contentType
        });

        await notif.save();
        res.status(201).json({ success: true, data: notif });
    } catch (error) {
        console.error('Error creating custom notification:', error);
        res.status(400).json({ message: 'Error creating notification', error: error.message });
    }
});

// DELETE /api/:lob/notifications/:id -> Delete a notification (authorized users only)
router.delete('/:id', isAuthenticated, async (req, res) => {
    try {
        if (!isAuthorizer(req)) {
            return res.status(403).json({ message: 'Forbidden: Insufficient permissions to delete notifications' });
        }

        const lob = req.params.lob.toLowerCase().trim();
        const notif = await Notification.findOneAndDelete({ _id: req.params.id, lob });
        
        if (!notif) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(400).json({ message: 'Error deleting notification', error: error.message });
    }
});

module.exports = router;
