const User = require('../models/User');

const isAuthenticated = async (req, res, next) => {
    if (req.session && req.session.user) {
        try {
            const user = await User.findById(req.session.user.id || req.session.user._id).select('currentSessionId isActive role hasAdminPanelAccess');
            
            if (user) {
                req.session.user.hasAdminPanelAccess = user.hasAdminPanelAccess || false;
            }
            
            if (!user || user.isActive === false) {
                req.session.destroy(() => {
                    const isApi = req.originalUrl && req.originalUrl.startsWith('/api');
                    if (isApi) {
                        return res.status(401).json({ message: 'account_deactivated' });
                    }
                    res.redirect('/login?reason=account_deactivated');
                });
                return;
            }

            if (user.role !== req.session.user.role) {
                req.session.destroy(() => {
                    const isApi = req.originalUrl && req.originalUrl.startsWith('/api');
                    if (isApi) {
                        return res.status(401).json({ message: 'role_changed' });
                    }
                    res.redirect('/login?reason=role_changed');
                });
                return;
            }

            if (user.currentSessionId && user.currentSessionId !== req.sessionID) {
                req.session.destroy(() => {
                    const isApi = req.originalUrl && req.originalUrl.startsWith('/api');
                    if (isApi) {
                        return res.status(401).json({ message: 'logged_in_elsewhere' });
                    }
                    res.redirect('/login?reason=single_device');
                });
                return;
            }

            // Update user last active timestamp (throttled to once every 5 minutes)
            const now = new Date();
            if (!req.session.lastActiveUpdate || (now - new Date(req.session.lastActiveUpdate)) > 5 * 60 * 1000) {
                await User.updateOne(
                    { _id: req.session.user.id || req.session.user._id },
                    { $set: { lastActiveAt: now } }
                );
                req.session.lastActiveUpdate = now;
            }
        } catch (err) {
            console.error('[AuthMiddleware] Single device session verification error:', err);
        }
        return next();
    }
    // Return JSON for API requests, redirect for views
    const isApi = req.originalUrl && req.originalUrl.startsWith('/api');
    if (isApi) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    res.redirect('/login');
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Admin access required.' });
};

const isEditorOrAdmin = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'editor' || req.session.user.role === 'admin')) {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Editor or Admin access required.' });
};

const isTeamLeadOrAbove = (req, res, next) => {
    const role = req.session?.user?.role;
    if (role === 'admin' || role === 'team_lead') return next();
    return res.status(403).json({ message: 'Forbidden: Team Lead or Admin required.' });
};

const isVendorOrAbove = (req, res, next) => {
    const role = req.session?.user?.role;
    if (role === 'admin' || role === 'vendor') return next();
    return res.status(403).json({ message: 'Forbidden: Vendor or Admin required.' });
};

const isQAOrAbove = (req, res, next) => {
    const role = req.session?.user?.role;
    if (role === 'admin' || role === 'vendor' || role === 'quality_analyst') return next();
    return res.status(403).json({ message: 'Forbidden: Quality Analyst or higher required.' });
};

const isEditorOrAbove = (req, res, next) => {
    const role = req.session?.user?.role;
    if (['editor','team_lead','quality_analyst','vendor','admin'].includes(role)) return next();
    return res.status(403).json({ message: 'Forbidden: Editor or higher required.' });
};

const isBroadcaster = (req, res, next) => {
    const role = req.session?.user?.role;
    if (['team_lead','quality_analyst','vendor','admin'].includes(role)) return next();
    return res.status(403).json({ message: 'Forbidden: Broadcast permission required.' });
};

const isVendorOrAdmin = (req, res, next) => {
    const role = req.session?.user?.role;
    const hasAdminPanelAccess = req.session?.user?.hasAdminPanelAccess;
    if (['vendor','admin'].includes(role) || hasAdminPanelAccess === true) return next();
    return res.status(403).json({ message: 'Forbidden: Vendor or Admin required.' });
};

const isNotNew = (req, res, next) => {
    const role = req.session?.user?.role;
    if (role && role !== 'new') return next();
    return res.status(403).json({ message: 'Forbidden: Upgrade access level from NEW to proceed.' });
};

const isUserManager = (req, res, next) => {
    const role = req.session?.user?.role;
    const hasAdminPanelAccess = req.session?.user?.hasAdminPanelAccess;
    if (['team_lead','quality_analyst','vendor','admin'].includes(role) || hasAdminPanelAccess === true) return next();
    return res.status(403).json({ message: 'Forbidden: User Management access required.' });
};

module.exports = { isAuthenticated, isAdmin, isEditorOrAdmin, isTeamLeadOrAbove, isVendorOrAbove, isQAOrAbove, isEditorOrAbove, isBroadcaster, isVendorOrAdmin, isNotNew, isUserManager };