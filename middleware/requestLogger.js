const Logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    
    // Override res.send to capture response data
    res.send = function(data) {
        const responseTime = Date.now() - startTime;
        const user = req.session?.user;
        
        // Only log API requests, not static files or views
        if (req.originalUrl.startsWith('/api/')) {
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
