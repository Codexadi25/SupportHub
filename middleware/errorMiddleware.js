const Log = require('../models/Log');

const errorHandler = async (err, req, res, next) => {
    
    // --- Start of New Error Parsing Logic ---
    let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    let message = err.message;

    // 1. Check for Mongoose Validation Error (like 'password required')
    if (err.name === 'ValidationError') {
        statusCode = 400; // Bad Request
        message = Object.values(err.errors).map(val => val.message).join(', ');
    }

    // 2. Check for Mongoose Bad ObjectId
    if (err.name === 'CastError' && err.kind === 'ObjectId') {
        statusCode = 404; // Not Found
        message = `Resource not found with ID ${err.value}`;
    }
    // --- End of New Error Parsing Logic ---

    // Log the error to the database
    try {
        const user = req?.session?.user;
        await Log.create({
            level: 'error',
            message: message, // <-- Use the new, clean message
            stack: err.stack,
            user: user?._id || user?.id || null,
            username: user?.username || '',
            ip: req.ip || req.connection?.remoteAddress || '',
            userAgent: req.get ? req.get('User-Agent') : ''
        });
    } catch (dbError) {
        console.error('Failed to write to log database:', dbError);
    }
    
    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
        console.error(err.stack);
    }

    // Send the final, formatted JSON response
    res.status(statusCode); // <-- Use the new status code
    res.json({
        message: message, // <-- Use the new, clean message
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};

module.exports = { errorHandler };