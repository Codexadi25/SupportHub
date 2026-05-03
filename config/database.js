const mongoose = require('mongoose');
const dns = require('dns');

const connectDB = async () => {
    if (process.env.MONGO_URI?.startsWith('mongodb+srv://')) {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        console.log('Using Google/Cloudflare DNS servers for Atlas SRV resolution');
    }

    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;