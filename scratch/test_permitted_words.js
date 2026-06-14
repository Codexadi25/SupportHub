require('dotenv').config();
const mongoose = require('mongoose');

// Bypass SRV lookup failure under Cloudflare WARP by using direct connection string
if (process.env.MONGO_URI && process.env.MONGO_URI.includes('cluster0.lbblfev.mongodb.net')) {
    process.env.MONGO_URI = 'mongodb://creedracer111:9RiWorNgz2KVyGi3@ac-oezl7xf-shard-00-00.lbblfev.mongodb.net:27017/default?ssl=true&authSource=admin';
}

const connectDB = require('../config/database');
const PermittedWord = require('../models/PermittedWord');
const wordManager = require('../utils/permittedWordManager');

async function runTests() {
    console.log('--- STARTING AI PERMITTED WORD LIST TESTS ---');
    
    // Connect to DB
    await connectDB();
    
    try {
        // 1. Test getWordVariations inflection generation
        console.log('\n[TEST 1] Testing getWordVariations NLP inflection generator...');
        const cancelVariations = wordManager.getWordVariations('cancel');
        console.log('Variations of "cancel":', cancelVariations);
        if (cancelVariations.includes('cancels') && cancelVariations.includes('cancelled')) {
            console.log('✅ TEST 1 PASSED: Correct tenses generated.');
        } else {
            console.warn('❌ TEST 1 FAILED: Variations missing some tenses.');
        }

        // 2. Test manual addition
        console.log('\n[TEST 2] Inserting/updating test permitted words...');
        const testWords = ['delivery', 'partner', 'food', 'late', 'cancel', 'address', 'order', 'due', 'update'];
        for (const w of testWords) {
            const vars = wordManager.getWordVariations(w);
            await PermittedWord.findOneAndUpdate(
                { word: w },
                { similarWords: vars, source: 'user_added', isActive: true },
                { upsert: true, new: true }
            );
        }
        console.log('✅ TEST 2 PASSED: Test permitted words successfully populated in DB.');

        // 3. Test validateTextAgainstPermitted validation logic
        console.log('\n[TEST 3] Testing validation of compliant text...');
        const validText = "The food delivery partner cancelled the order due to late address updates.";
        const validCheck = await wordManager.validateTextAgainstPermitted(validText);
        console.log(`Text: "${validText}"`);
        console.log('Validation results:', validCheck);
        if (validCheck.isValid) {
            console.log('✅ TEST 3 PASSED: Compliant text validated successfully.');
        } else {
            console.warn('❌ TEST 3 FAILED: Compliant text rejected.', validCheck.violatedWords);
        }

        console.log('\n[TEST 4] Testing validation of non-compliant text...');
        const invalidText = "The delivery driver crashed their bicycle and stolen the pizza.";
        const invalidCheck = await wordManager.validateTextAgainstPermitted(invalidText);
        console.log(`Text: "${invalidText}"`);
        console.log('Validation results:', invalidCheck);
        if (!invalidCheck.isValid && invalidCheck.violatedWords.includes('crashed') && invalidCheck.violatedWords.includes('bicycle')) {
            console.log('✅ TEST 4 PASSED: Non-permitted words caught successfully:', invalidCheck.violatedWords);
        } else {
            console.warn('❌ TEST 4 FAILED: Invalid text not caught properly.', invalidCheck);
        }
        // Clean up database test entries
        console.log('\nCleaning up database test entries...');
        await PermittedWord.deleteMany({ word: { $in: testWords } });
        console.log('Cleanup complete.');
    } catch (err) {
        console.error('Test execution error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\n--- TESTS COMPLETED. DATABASE CONNECTION CLOSED ---');
    }
}

runTests();
