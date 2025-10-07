const express = require('express');
const router = express.Router();
const Notice = require('../../models/Notice');
const Logger = require('../../utils/logger');
const { isAuthenticated, isAdmin } = require('../../middleware/authMiddleware');

// helper: admin or team_lead
function isAdminOrTeamLead(req, res, next) {
    const role = req?.session?.user?.role;
    if (role === 'admin' || role === 'team_lead') return next();
    return res.status(403).json({ message: 'Forbidden: Admin or Team Lead access required.' });
}

// View active notices (all authenticated users)
router.get('/', isAuthenticated, async (req, res) => {
    try {
        const now = new Date();
        const notices = await Notice.find({ isActive: true, $or: [{ endDate: null }, { endDate: { $gt: now } }] })
            .sort({ priority: -1, createdAt: -1 });
        res.json(notices);
    } catch (error) {
        await Logger.logError('Error fetching notices', error, { user: req.session?.user?._id, username: req.session?.user?.username, resource: 'Notice', action: 'READ', statusCode: 500 });
        res.status(500).json({ message: 'Error fetching notices', error: error.message });
    }
});

// Create notice (admin or team_lead)
// Publish Notices: Admin only per CSV
router.post('/', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { title, content, type = 'info', priority = 'medium', endDate } = req.body;
        if (!title || !content) {
            return res.status(400).json({ message: 'Title and content are required' });
        }
        if (String(content).length > 300) {
            return res.status(400).json({ message: 'Content exceeds 300 characters' });
        }

        const sessionUser = req.session.user || {};
        const authorId = sessionUser._id || sessionUser.id;

        const notice = new Notice({
            title,
            content,
            type,
            priority,
            authorId,
            authorName: sessionUser.username,
            endDate: endDate ? new Date(endDate) : null
        });

        await notice.save();
        await Logger.logDatabaseChange('CREATE', 'Notice', notice._id.toString(), null, { title, content }, req.session.user?._id, req.session.user?.username, { ip: req.ip, userAgent: req.get('User-Agent') });
        res.status(201).json({ message: 'Notice created successfully', data: notice });
    } catch (error) {
        await Logger.logError('Error creating notice', error, { user: req.session?.user?._id, username: req.session?.user?.username, resource: 'Notice', action: 'CREATE', statusCode: 400 });
        res.status(400).json({ message: 'Error creating notice', error: error.message });
    }
});

// Update notice (admin or team_lead)
// Update Notices: Admin only per CSV
router.put('/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { title, content, type, priority, endDate, isActive } = req.body;
        if (content && String(content).length > 300) {
            return res.status(400).json({ message: 'Content exceeds 300 characters' });
        }
        const notice = await Notice.findById(req.params.id);
        if (!notice) return res.status(404).json({ message: 'Notice not found' });
        if (title !== undefined) notice.title = title;
        if (content !== undefined) notice.content = content;
        if (type !== undefined) notice.type = type;
        if (priority !== undefined) notice.priority = priority;
        if (endDate !== undefined) notice.endDate = endDate ? new Date(endDate) : null;
        if (isActive !== undefined) notice.isActive = !!isActive;
        await notice.save();
        await Logger.logDatabaseChange('UPDATE', 'Notice', notice._id.toString(), null, { title, content, type, priority }, req.session.user?._id, req.session.user?.username, { ip: req.ip, userAgent: req.get('User-Agent') });
        res.json({ message: 'Notice updated successfully', data: notice });
    } catch (error) {
        await Logger.logError('Error updating notice', error, { user: req.session?.user?._id, username: req.session?.user?.username, resource: 'Notice', action: 'UPDATE', statusCode: 400 });
        res.status(400).json({ message: 'Error updating notice', error: error.message });
    }
});

// Delete notice (admin only)
// Delete Notices: Admin only per CSV
router.delete('/:id', isAuthenticated, async (req, res) => {
    try {
        if (req.session.user?.role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden: Admin access required.' });
        }
        const notice = await Notice.findByIdAndDelete(req.params.id);
        if (!notice) return res.status(404).json({ message: 'Notice not found' });
        await Logger.logDatabaseChange('DELETE', 'Notice', req.params.id, null, null, req.session.user?._id, req.session.user?.username, { ip: req.ip, userAgent: req.get('User-Agent') });
        res.json({ message: 'Notice deleted successfully' });
    } catch (error) {
        await Logger.logError('Error deleting notice', error, { user: req.session?.user?._id, username: req.session?.user?.username, resource: 'Notice', action: 'DELETE', statusCode: 400 });
        res.status(400).json({ message: 'Error deleting notice', error: error.message });
    }
});

module.exports = router;


