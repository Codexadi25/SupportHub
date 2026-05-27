require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Category = require('../models/Category');
const PrivateNote = require('../models/PrivateNote');
const Feedback = require('../models/Feedback');
const Notice = require('../models/Notice');
const Message = require('../models/Message');

async function verify() {
    await connectDB();
    
    try {
        console.log('\n--- Category Collection Index Check ---');
        const catIndexes = await Category.collection.indexes();
        console.log('Category Indexes:', JSON.stringify(catIndexes, null, 2));

        console.log('\n--- Sample Category Verification ---');
        const catSample = await Category.findOne({});
        if (catSample) {
            console.log(`Found category title: "${catSample.title}", lob: "${catSample.lob}"`);
        } else {
            console.log('No categories found.');
        }

        console.log('\n--- Sample PrivateNote Verification ---');
        const pnSample = await PrivateNote.findOne({});
        if (pnSample) {
            console.log(`Found PrivateNote title: "${pnSample.title}", lob: "${pnSample.lob}", createdBy: "${pnSample.createdBy}"`);
        } else {
            console.log('No PrivateNotes found.');
        }

        console.log('\n--- Sample Feedback Verification ---');
        const fbSample = await Feedback.findOne({});
        if (fbSample) {
            console.log(`Found Feedback title: "${fbSample.title}", lob: "${fbSample.lob}", type: "${fbSample.type}"`);
        } else {
            console.log('No feedbacks found.');
        }

        console.log('\n--- Sample Notice Verification ---');
        const ntSample = await Notice.findOne({});
        if (ntSample) {
            console.log(`Found Notice title: "${ntSample.title}", lob: "${ntSample.lob}", type: "${ntSample.type}"`);
        } else {
            console.log('No notices found.');
        }

        console.log('\n--- Sample Message Check ---');
        const msgSample = await Message.findOne({});
        if (msgSample) {
            console.log(`Found Message title: "${msgSample.title}", lob: "${msgSample.lob}", type: "${msgSample.type}"`);
        } else {
            console.log('No messages found.');
        }

        console.log('\n✅ Verification checks complete!');
    } catch (err) {
        console.error('Error during verification:', err);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed.');
    }
}

verify();
