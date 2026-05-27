require('dotenv').config();
const mongoose = require('mongoose');
const Log = require('./models/Log');
const connectDB = require('./config/database');

const run = async () => {
    await connectDB();
    try {
        const errors = await Log.find({ level: 'error' }).sort({ createdAt: -1 }).limit(5);
        console.log('--- Latest 5 Error Logs ---');
        errors.forEach(e => {
            console.log(`[${e.createdAt.toISOString()}] ${e.message}`);
            console.log(`Description: ${e.description}`);
            if (e.stack) console.log(`Stack: ${e.stack}`);
            console.log('---------------------------');
        });
    } catch (err) {
        console.error('Error fetching logs:', err);
    } finally {
        await mongoose.disconnect();
    }
};

run();
