require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Category = require('../models/Category');
const PrivateNote = require('../models/PrivateNote');
const Feedback = require('../models/Feedback');
const Notice = require('../models/Notice');
const Message = require('../models/Message');

async function migrate() {
    await connectDB();
    
    try {
        console.log('Migrating Categories to default lob "zomato"...');
        
        // Drop the old single-key unique index on title first to prevent conflicts
        try {
            await Category.collection.dropIndex('title_1');
            console.log('Successfully dropped old single-key unique index: title_1');
        } catch (e) {
            console.log('Old index title_1 was not found or was already dropped.');
        }

        const catResult = await Category.updateMany({}, { $set: { lob: 'zomato' } });
        console.log(`Updated ${catResult.matchedCount} Category documents, modified ${catResult.modifiedCount}.`);

        console.log('Migrating PrivateNotes to default lob "zomato"...');
        const pnResult = await PrivateNote.updateMany({}, { $set: { lob: 'zomato' } });
        console.log(`Updated ${pnResult.matchedCount} PrivateNote documents, modified ${pnResult.modifiedCount}.`);

        console.log('Migrating Feedbacks to default lob "zomato"...');
        const fbResult = await Feedback.updateMany({}, { $set: { lob: 'zomato' } });
        console.log(`Updated ${fbResult.matchedCount} Feedback documents, modified ${fbResult.modifiedCount}.`);

        console.log('Migrating Notices to default lob "zomato"...');
        const ntResult = await Notice.updateMany({}, { $set: { lob: 'zomato' } });
        console.log(`Updated ${ntResult.matchedCount} Notice documents, modified ${ntResult.modifiedCount}.`);

        console.log('Migrating Messages to default lob "zomato"...');
        const msgResult = await Message.updateMany({}, { $set: { lob: 'zomato' } });
        console.log(`Updated ${msgResult.matchedCount} Message documents, modified ${msgResult.modifiedCount}.`);

        console.log('🎉 Migration successful!');
    } catch (err) {
        console.error('Error during migration:', err);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed.');
    }
}

migrate();
