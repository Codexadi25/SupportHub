/**
 * alignUsers.js
 * Migration/maintenance script to align each user in the database to the 'zomato' department.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const User = require('../models/User');

const alignAllUsersToZomato = async () => {
    try {
        console.log('Connecting to database...');
        await connectDB();
        console.log('Database connected successfully.');

        // Find all users in the database
        const users = await User.find({});
        console.log(`Found ${users.length} users in the database.`);

        if (users.length === 0) {
            console.log('No users found to align.');
            return;
        }

        console.log('Aligning users to the "zomato" department...');
        
        // Update all users' department to 'zomato'
        const result = await User.updateMany({}, { $set: { department: 'zomato' } });
        
        console.log(`✅ Updated ${result.modifiedCount} users.`);
        
        // Output aligned users
        const updatedUsers = await User.find({ department: 'zomato' }).select('username role department');
        console.log('\nList of aligned users:');
        updatedUsers.forEach((u, i) => {
            console.log(`  ${i + 1}. [${u.username}] — Role: ${u.role} → Dept: ${u.department}`);
        });

        console.log('\n🎉 All users have been successfully aligned to the "zomato" department!');

    } catch (error) {
        console.error('❌ Error during user alignment migration:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from the database.');
    }
};

// Run the script
alignAllUsersToZomato();
