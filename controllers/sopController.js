const { Sop, Audit } = require('../models/Sop');
const Notification = require('../models/Notification');
const Logger = require('../utils/logger');

/**
 * Handles the Approval/Publishing Workflow
 *
 */
exports.approveDraft = async (req, res) => {
    const { id } = req.params;
    const { action } = req.body; // 'Approve' or 'Reject'
    const userRole = req.user?.role;
    if (!userRole) return res.status(401).json({ error: 'Authentication required' });
    if (userRole !== 'Admin' && userRole !== 'Client') return res.status(403).json({ error: 'Unauthorized for approval' });

    try {
        const sop = await Sop.findById(id);
        if (!sop) return res.status(404).json({ error: 'SOP not found' });

        if (action === 'Approve') {
            sop.status = 'Published';
            await sop.save();

            // Log the publication
            await Audit.create({
                sopId: id,
                action: 'Published',
                details: `Approved by ${req.user?.username || 'unknown'} | ${req.user?.role || ''}`,
                user: req.user?.username || 'system'
            });

            // Dispatch notification alert
            try {
                await Notification.create({
                    title: `New SOP Published: ${sop.title}`,
                    content: `A new SOP under category "${sop.category}" has been approved and published.`,
                    type: 'sop_update',
                    recipientDepartment: sop.lob,
                    lob: sop.lob
                });
            } catch (notifErr) {
                console.error('[Notification Trigger] Failed to create SOP approval notification:', notifErr);
                await Logger.logError('[SopController] Failed to create SOP approval notification', notifErr, { action: 'approve_draft_notification', resource: 'sop', sopId: id });
            }
        } else {
            sop.status = 'Draft'; // Or 'Rejected'
            await sop.save();
        }

        res.json({ success: true, status: sop.status });
    } catch (err) {
        console.error('approveDraft error:', err);
        await Logger.logError('[SopController] approveDraft failed', err, { action: 'approve_draft', resource: 'sop', sopId: id });
        res.status(500).json({ error: err.message });
    }
};

/**
 * Create New SOP Block in a specific section
 *
 */
exports.createBlock = async (req, res) => {
    try {
        const { category, title, condition, action, tags, lob } = req.body;
        const user = req.user;
        if (!user) return res.status(401).send('Authentication required');

        const tagArray = (typeof tags === 'string' && tags.length) ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

        const newSop = new Sop({
            lob,
            category,
            title,
            condition,
            action,
            tags: tagArray,
            status: 'Draft', // New blocks start as Drafts
            lastUpdated: {
                at: new Date(),
                by: user.username || 'unknown',
                role: user.role || 'unknown'
            }
        });

        await newSop.save();
        res.redirect(`/${lob}/sop/drafts`);
    } catch (err) {
        console.error('createBlock error:', err);
        await Logger.logError('[SopController] createBlock failed', err, { action: 'create_block', resource: 'sop' });
        res.status(500).send(err.message);
    }
};