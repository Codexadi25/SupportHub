const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../config/database');
const User = require('../models/User');
const Team = require('../models/Team');
const PerformanceRecord = require('../models/PerformanceRecord');
const KpiTarget = require('../models/KpiTarget');
const UploadBatch = require('../models/UploadBatch');

const migrate = async () => {
    try {
        await connectDB();
        console.log('Database connected successfully.');

        // 1. Update all Users:
        // Set organization to 'startek india'
        // If employeeId is missing, generate one
        const users = await User.find({});
        console.log(`Processing ${users.length} users...`);
        let userUpdated = 0;
        for (const user of users) {
            let changed = false;
            if (user.organization !== 'startek india') {
                user.organization = 'startek india';
                changed = true;
            }
            if (!user.employeeId) {
                const cleanUser = user.username.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                user.employeeId = `EMP-${cleanUser || 'USER'}`;
                changed = true;
            }
            if (changed) {
                await user.save({ validateBeforeSave: false });
                userUpdated++;
            }
        }
        console.log(`✅ Updated ${userUpdated} users.`);

        // 2. Update all Teams: set organization to 'startek india'
        const teamResult = await Team.updateMany(
            { organization: { $ne: 'startek india' } },
            { $set: { organization: 'startek india' } }
        );
        console.log(`✅ Updated ${teamResult.modifiedCount} teams.`);

        // 3. Update all KpiTargets: set organization to 'startek india'
        const kpiResult = await KpiTarget.updateMany(
            { organization: { $ne: 'startek india' } },
            { $set: { organization: 'startek india' } }
        );
        console.log(`✅ Updated ${kpiResult.modifiedCount} KPI targets.`);

        // 4. Update all UploadBatches: set organization to 'startek india'
        const batchResult = await UploadBatch.updateMany(
            { organization: { $ne: 'startek india' } },
            { $set: { organization: 'startek india' } }
        );
        console.log(`✅ Updated ${batchResult.modifiedCount} upload batches.`);

        // 5. Update all PerformanceRecords:
        // Set organization to 'startek india'
        // If employeeId is missing, backfill from mapped user
        const records = await PerformanceRecord.find({});
        console.log(`Processing ${records.length} performance records...`);
        let recordUpdated = 0;
        for (const rec of records) {
            let changed = false;
            if (rec.organization !== 'startek india') {
                rec.organization = 'startek india';
                changed = true;
            }
            if (!rec.employeeId && rec.userId) {
                const u = await User.findById(rec.userId);
                if (u && u.employeeId) {
                    rec.employeeId = u.employeeId;
                    changed = true;
                }
            }
            if (changed) {
                await rec.save({ validateBeforeSave: false });
                recordUpdated++;
            }
        }
        console.log(`✅ Updated ${recordUpdated} performance records.`);

        console.log('🎉 Migration successful!');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
    }
};

migrate();
