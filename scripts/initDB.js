const express = require('express');
require('dotenv').config();
const fs = 'fs';
const path = 'path';
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const User = require('../models/User');
const Category = require('../models/Category');

const initializeDatabase = async () => {
    try {
        await connectDB();
        console.log('Database connected successfully.');

        // --- Clear existing data ---
        console.log('Clearing existing user and category data...');
        await User.deleteMany({});
        await Category.deleteMany({});
        console.log('✅ Existing data cleared.');

        // --- Read data from JSON file ---
        const dataPath = path.join(__dirname, 'data.json');
        const initialData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

        // --- Insert new data ---
        if (initialData.users && initialData.users.length > 0) {
            // The pre-save hook in the User model will hash the passwords automatically
            await User.insertMany(initialData.users);
            console.log(`✅ Inserted ${initialData.users.length} users.`);
        }

        if (initialData.categories && initialData.categories.length > 0) {
            await Category.insertMany(initialData.categories);
            console.log(`✅ Inserted ${initialData.categories.length} categories.`);
        }

        console.log('\n🎉 Database initialization complete!');

    } catch (error) {
        console.error('❌ Error during database initialization:', error);
        process.exit(1); // Exit with an error code
    } finally {
        // --- Disconnect from the database ---
        await mongoose.disconnect();
        console.log('Disconnected from the database.');
    }
};

// Run the initialization function
initializeDatabase();