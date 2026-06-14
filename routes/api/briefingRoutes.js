const express = require('express');
const router = express.Router({ mergeParams: true });
const Briefing = require('../../models/Briefing');
const Notification = require('../../models/Notification');
const { isAuthenticated } = require('../../middleware/authMiddleware');

const AUTHORIZED_ROLES = ['admin', 'vendor', 'team_lead', 'quality_analyst'];

function checkBriefingPermission(req, res, next) {
    const role = req.session?.user?.role || req.user?.role;
    if (AUTHORIZED_ROLES.includes(role)) {
        return next();
    }
    return res.status(403).json({ message: 'Forbidden: Only Team Leaders, Quality Analysts, Vendors, and Admins can share or modify briefings.' });
}

// GET /api/:lob/briefings -> Get briefings and updates for LOB
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const lob = req.params.lob.toLowerCase().trim();
        const briefings = await Briefing.find({ lob })
            .sort({ createdAt: -1 })
            .limit(100);
        res.json(briefings);
    } catch (error) {
        console.error('Error fetching briefings:', error);
        res.status(500).json({ message: 'Error fetching briefings', error: error.message });
    }
});

// POST /api/:lob/briefings -> Share a new briefing/SOP update
router.post('/', isAuthenticated, checkBriefingPermission, async (req, res) => {
    try {
        const { title, content, type = 'daily_briefing', contentType = 'plain' } = req.body;
        const lob = req.params.lob.toLowerCase().trim();
        const sessionUser = req.session.user || req.user || {};

        if (!title || !content) {
            return res.status(400).json({ message: 'Title and content are required' });
        }

        const briefing = new Briefing({
            title,
            content,
            type,
            authorId: sessionUser._id || sessionUser.id,
            authorName: sessionUser.username,
            authorRole: sessionUser.role,
            lob,
            contentType
        });

        await briefing.save();

        // Automatically dispatch notification
        const typeLabel = type === 'sop_update' ? 'SOP Update' : 'Daily Briefing';
        const notifType = type === 'sop_update' ? 'sop_update' : 'briefing';

        // Teaser text (avoiding broken HTML/Markdown tags in notifications bell)
        const cleanTeaser = contentType === 'plain'
            ? content
            : 'Click to view the published update details.';

        const notif = new Notification({
            title: `New ${typeLabel}: ${title}`,
            content: cleanTeaser.length > 200 ? `${cleanTeaser.substring(0, 200)}...` : cleanTeaser,
            type: notifType,
            recipientDepartment: lob,
            lob,
            contentType: 'plain'
        });

        await notif.save();

        res.status(201).json({ success: true, data: briefing });
    } catch (error) {
        console.error('Error sharing briefing:', error);
        res.status(400).json({ message: 'Error sharing briefing', error: error.message });
    }
});

// DELETE /api/:lob/briefings/:id -> Delete a shared briefing
router.delete('/:id', isAuthenticated, checkBriefingPermission, async (req, res) => {
    try {
        const lob = req.params.lob.toLowerCase().trim();
        const briefing = await Briefing.findOneAndDelete({ _id: req.params.id, lob });

        if (!briefing) {
            return res.status(404).json({ message: 'Briefing/update not found' });
        }

        res.json({ success: true, message: 'Briefing/update deleted successfully' });
    } catch (error) {
        console.error('Error deleting briefing:', error);
        res.status(400).json({ message: 'Error deleting briefing', error: error.message });
    }
});

module.exports = router;
