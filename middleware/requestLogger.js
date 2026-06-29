const Logger = require('../utils/logger');

/**
 * Read-only GET endpoints polled frequently by the admin UI.
 *
 * Rule:
 *   - Successful responses (2xx, 3xx) are NEVER written to the DB.
 *     They carry zero diagnostic value and were filling the logs collection.
 *   - Errors (4xx / 5xx) ARE still logged — those need attention.
 *   - Slow responses (> 5 s) ARE still logged as timeouts regardless.
 *
 * Add any future polling endpoint here to keep the DB clean.
 */
const SILENT_READONLY_PATTERNS = [
    '/api/user-activity/department-users',
    '/api/admin/users',
    '/api/admin/user-activity-stats',
    '/api/admin/departments',
    '/api/ping',
    '/messages/my'
];

const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;

    res.send = function (data) {
        const responseTime = Date.now() - startTime;
        const user = req.session?.user;

        // Only instrument API routes (skip static assets, views)
        if (req.originalUrl.startsWith('/api/')) {

            const isSilencedRoute =
                req.method === 'GET' &&
                SILENT_READONLY_PATTERNS.some(p => req.originalUrl.includes(p));

            const isSuccess = res.statusCode >= 200 && res.statusCode < 400;
            const isError   = res.statusCode >= 500;
            const isSlow    = responseTime > 5000;

            // ── Slow-response warning (always log, even for silenced routes) ──
            if (isSlow) {
                Logger.logTimeout(
                    req.originalUrl, responseTime, user?.id, user?.username,
                    {
                        ip:        req.ip || req.connection?.remoteAddress,
                        userAgent: req.get('User-Agent'),
                    }
                ).catch(err => console.error('[Logger] timeout log failed:', err));
            }

            // ── Error logging (always log, even for silenced routes) ─────────
            if (isError) {
                const logOptions = {
                    user:         user?.id,
                    username:     user?.username,
                    ip:           req.ip || req.connection?.remoteAddress,
                    userAgent:    req.get('User-Agent'),
                    responseTime,
                    statusCode:   res.statusCode,
                    action:       req.method,
                    resource:     req.originalUrl.split('/')[2] || 'unknown',
                };
                
                if (res.statusCode >= 500) {
                    Logger.logError(
                        `HTTP ${res.statusCode}: ${req.method} ${req.originalUrl}`,
                        new Error(`HTTP ${res.statusCode}`),
                        logOptions
                    ).catch(err => console.error('[Logger] error log failed:', err));
                } else {
                    Logger.logWarning(
                        `HTTP ${res.statusCode}: ${req.method} ${req.originalUrl}`,
                        logOptions
                    ).catch(err => console.error('[Logger] warning log failed:', err));
                }
            }

            // ── Info logging — skip silenced routes on success ────────────────
            if (isSuccess && !isSilencedRoute) {
                Logger.logInfo(`${req.method} ${req.originalUrl}`, {
                    user:         user?.id,
                    username:     user?.username,
                    ip:           req.ip || req.connection?.remoteAddress,
                    userAgent:    req.get('User-Agent'),
                    responseTime,
                    statusCode:   res.statusCode,
                    action:       req.method,
                    resource:     req.originalUrl.split('/')[2] || 'unknown',
                }).catch(err => console.error('[Logger] info log failed:', err));
            }
        }

        return originalSend.call(this, data);
    };

    next();
};

module.exports = requestLogger;
