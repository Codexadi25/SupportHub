const Logger = require('../utils/logger');

// Cache to store the last logged timestamp for department-users ping (throttle to 3 mins)
const lastPingLogs = new Map();

const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    // Override res.send to capture response data
    res.send = function(data) {
        const responseTime = Date.now() - startTime;
        const user = req.session?.user;
        
        // Only log API requests, not static files or views
        if (req.originalUrl.startsWith('/api/')) {
            let shouldLog = true;
            
            // Check if this is the department-users ping endpoint
            if (req.originalUrl.includes('/api/user-activity/department-users')) {
                const key = user?.username || req.ip || 'anonymous';
                const lastLogTime = lastPingLogs.get(key) || 0;
                const now = Date.now();
                
                if (now - lastLogTime < 3 * 60 * 1000) { // 3 minutes
                    shouldLog = false;
                } else {
                    lastPingLogs.set(key, now);
                }
            }

            if (shouldLog) {
                // Log the request
                Logger.logInfo(`${req.method} ${req.originalUrl}`, {
                    user: user?.id,
                    username: user?.username,
                    ip: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('User-Agent'),
                    responseTime,
                    statusCode: res.statusCode,
                    action: req.method,
                    resource: req.originalUrl.split('/')[2] || 'unknown'
                }).catch(err => console.error('Failed to log request:', err));
            }

            // Log timeouts (if response time > 5 seconds)
            if (responseTime > 5000) {
                Logger.logTimeout(req.originalUrl, responseTime, user?.id, user?.username, {
                    ip: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('User-Agent')
                }).catch(err => console.error('Failed to log timeout:', err));
            }

            // Log errors (4xx, 5xx status codes)
            if (res.statusCode >= 400) {
                Logger.logError(`HTTP ${res.statusCode}: ${req.method} ${req.originalUrl}`, 
                    new Error(`HTTP ${res.statusCode}`), {
                    user: user?.id,
                    username: user?.username,
                    ip: req.ip || req.connection.remoteAddress,
                    userAgent: req.get('User-Agent'),
                    responseTime,
                    statusCode: res.statusCode,
                    action: req.method,
                    resource: req.originalUrl.split('/')[2] || 'unknown'
                }).catch(err => console.error('Failed to log error:', err));
            }
        }

        // Call original send and return for proper chaining
        return originalSend.call(this, data);
    };

    next();
};

module.exports = requestLogger;
