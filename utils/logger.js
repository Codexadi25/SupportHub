const Log = require('../models/Log');
const mongoose = require('mongoose');

class Logger {
    static async log(level, message, options = {}) {
        try {
            // If database is not connected, log to console and return to prevent buffering timeouts
            if (mongoose.connection.readyState !== 1) {
                console.log(`[Logger ${level.toUpperCase()}] ${message}`);
                return;
            }

            const logEntry = {
                level,
                message,
                description: options.description || '',
                stack: options.stack || '',
                user: options.user || null,
                username: options.username || '',
                action: options.action || '',
                resource: options.resource || '',
                resourceId: options.resourceId || '',
                oldData: options.oldData || null,
                newData: options.newData || null,
                ip: options.ip || '',
                userAgent: options.userAgent || '',
                responseTime: options.responseTime || null,
                statusCode: options.statusCode || null,
                errorCode: options.errorCode || '',
                severity: options.severity || 'medium'
            };

            await Log.create(logEntry);
        } catch (error) {
            console.error('Failed to log entry:', error);
        }
    }

    static async logError(message, error, options = {}) {
        await this.log('error', message, {
            ...options,
            stack: error.stack,
            description: `Error: ${error.message}`,
            severity: 'high'
        });
    }

    static async logDatabaseChange(action, resource, resourceId, oldData, newData, user, username, options = {}) {
        await this.log('database', `${action} operation on ${resource}`, {
            ...options,
            action,
            resource,
            resourceId,
            oldData,
            newData,
            user,
            username,
            description: `Database ${action}: ${resource} ${resourceId ? `(ID: ${resourceId})` : ''}`,
            severity: 'low'
        });
    }

    static async logTimeout(url, responseTime, user, username, options = {}) {
        await this.log('timeout', `Request timeout: ${url}`, {
            ...options,
            user,
            username,
            responseTime,
            description: `Request to ${url} timed out after ${responseTime}ms`,
            severity: 'medium'
        });
    }

    static async logInfo(message, options = {}) {
        await this.log('info', message, {
            ...options,
            severity: 'low'
        });
    }

    static async logWarning(message, options = {}) {
        await this.log('warn', message, {
            ...options,
            severity: 'medium'
        });
    }

    static async logDebug(message, options = {}) {
        await this.log('debug', message, {
            ...options,
            severity: 'low'
        });
    }
}

module.exports = Logger;
