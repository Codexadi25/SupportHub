const fs = require('fs');
const path = require('path');
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const { Sop } = require('../models/Sop');

const seedWimoSop = async () => {
    try {
        await connectDB();
        console.log('Database connected successfully.');

        // Delete existing blocks for WIMO-AI-Handover LOB
        console.log('Clearing existing SOP blocks for WIMO-AI-Handover...');
        await Sop.deleteMany({ lob: 'WIMO-AI-Handover' });
        console.log('✅ Existing WIMO-AI-Handover blocks cleared.');

        const dataPath = path.join(__dirname, '..', 'scratch', 'sop_data.json');
        if (!fs.existsSync(dataPath)) {
            console.error(`❌ Data file not found at ${dataPath}. Please run parse_sops.js first.`);
            process.exit(1);
        }

        const categories = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        let overallOrder = 0;
        const sopsToInsert = [];

        for (const cat of categories) {
            console.log(`Processing category: ${cat.category} ${cat.phase || ''}`);
            for (const item of cat.items) {
                sopsToInsert.push({
                    lob: 'WIMO-AI-Handover',
                    category: cat.category,
                    phase: cat.phase,
                    title: item.title,
                    condition: item.condition,
                    action: item.action,
                    details: item.details,
                    tags: item.tags,
                    status: 'Published',
                    order: overallOrder++,
                    lastUpdated: {
                        at: new Date(),
                        by: 'system',
                        role: 'admin'
                    }
                });
            }
        }

        if (sopsToInsert.length > 0) {
            await Sop.insertMany(sopsToInsert);
            console.log(`🎉 Success! Seeded ${sopsToInsert.length} SOP cards.`);
        } else {
            console.log('⚠️ No cards to seed.');
        }

    } catch (err) {
        console.error('❌ Error during seeding:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
    }
};

seedWimoSop();
