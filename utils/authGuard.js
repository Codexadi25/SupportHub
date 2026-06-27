// utils/authGuard.js
/**
 * Middleware to protect attendance routes.
 * Only team_lead, admin, and vendor roles are allowed.
 * Assumes your existing auth middleware already sets req.user.
 */
const ALLOWED_ROLES = ['team_lead', 'admin', 'vendor', 'quality_analyst'];

function guard(req, res, next) {
    // req.user is populated by your existing session/JWT middleware
    if (!req.user) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
    }

    if (!ALLOWED_ROLES.includes(req.user.role)) {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Forbidden — insufficient role' });
        }
        return res.status(403).render('error', {
            title: 'Access Denied',
            message: 'This section is only available to Team Leads, Admins, and Vendors.'
        });
    }

    // Enforce org isolation:
    // team_lead can only access their own org & team
    // admin can access their org (all teams)
    // vendor can access org(s) they are assigned to
    req.orgScope = req.user.organization || 'default';
    if (req.user.role === 'team_lead') {
        req.teamScope = req.user.teamId;
    }

    next();
}

module.exports = { guard, ALLOWED_ROLES };
