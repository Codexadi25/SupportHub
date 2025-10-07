const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
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
    if (['vendor','admin'].includes(role)) return next();
    return res.status(403).json({ message: 'Forbidden: Vendor or Admin required.' });
};

const isNotNew = (req, res, next) => {
    const role = req.session?.user?.role;
    if (role && role !== 'new') return next();
    return res.status(403).json({ message: 'Forbidden: Upgrade access level from NEW to proceed.' });
};

const isUserManager = (req, res, next) => {
    const role = req.session?.user?.role;
    if (['team_lead','quality_analyst','vendor','admin'].includes(role)) return next();
    return res.status(403).json({ message: 'Forbidden: User Management access required.' });
};

module.exports = { isAuthenticated, isAdmin, isEditorOrAdmin, isTeamLeadOrAbove, isVendorOrAbove, isQAOrAbove, isEditorOrAbove, isBroadcaster, isVendorOrAdmin, isNotNew, isUserManager };