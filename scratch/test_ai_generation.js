const mongoose = require('mongoose');
require('dotenv').config();

// Bypass SRV lookup failure under Cloudflare WARP by using direct connection string
if (process.env.MONGO_URI && process.env.MONGO_URI.includes('cluster0.lbblfev.mongodb.net')) {
    process.env.MONGO_URI = 'mongodb://creedracer111:9RiWorNgz2KVyGi3@ac-oezl7xf-shard-00-00.lbblfev.mongodb.net:27017/default?ssl=true&authSource=admin';
}

const connectDB = require('../config/database');
const Category = require('../models/Category');
const candController = require('../controllers/candController');

// Mock response creator
function createMockResponse() {
    const res = {
        statusCode: 200,
        jsonData: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.jsonData = data;
            return this;
        }
    };
    return res;
}

// Mocking the AI service for isolated testing
const aiService = require('../services/aiService');
const originalGenerateAiCannedResponse = aiService.generateAiCannedResponse;

async function runTests() {
    try {
        console.log('Connecting to database...');
        await connectDB();
        console.log('Connected.');

        // Clean up any old test category
        await Category.deleteMany({ lob: 'zomato', title: { $in: ['AI Generated', 'Test Category AI'] } });

        // Seed a test category
        const testCategory = await Category.create({ title: 'Test Category AI', lob: 'zomato' });
        const testCategoryId = testCategory._id.toString();

        // ─── CASE 1: Test with Mocked AI Success ───
        console.log('\n--- Test 1: Generate AI Canned Response (Mocked Success) ---');
        aiService.generateAiCannedResponse = async (scenario) => {
            return `AI Generated response for scenario: ${scenario} (under 190 chars, no pronouns)`;
        };

        const reqMock = {
            body: {
                tags: ['delayed_order', 'delivery_partner'],
                categoryId: testCategoryId
            },
            params: { lob: 'zomato' },
            session: {
                user: { id: new mongoose.Types.ObjectId().toString(), username: 'test_ai_user', role: 'admin' }
            },
            ip: '127.0.0.1',
            get() { return 'MockAgent'; }
        };
        const resMock = createMockResponse();

        await candController.generateAiTemplate(reqMock, resMock);
        console.log('Mocked AI Gen Status:', resMock.statusCode);
        console.log('Mocked AI Gen Data:', resMock.jsonData);

        if (resMock.statusCode !== 201 || !resMock.jsonData.success) {
            throw new Error('AI Generation failed');
        }

        // Verify it was saved under the specified Category in DB
        const catSaved = await Category.findById(testCategoryId);
        console.log('Category templates count:', catSaved.templates.length);
        if (catSaved.templates.length !== 1) {
            throw new Error('Template was not saved under the correct category');
        }
        console.log('Saved template text:', catSaved.templates[0].text);
        console.log('Saved template tags:', catSaved.templates[0].tags);
        console.log('Saved template isAi:', catSaved.templates[0].isAi);
        if (!catSaved.templates[0].isAi) {
            throw new Error('isAi property should be true');
        }
        if (!catSaved.templates[0].tags.includes('AI')) {
            throw new Error('AI tag not automatically added');
        }

        // ─── CASE 2: Test with Fallback to "AI Generated" Category ───
        console.log('\n--- Test 2: Fallback to "AI Generated" Category ---');
        const reqFallback = {
            body: {
                tags: ['food_spilled', 'customer_complaint']
                // no categoryId provided
            },
            params: { lob: 'zomato' },
            session: {
                user: { id: new mongoose.Types.ObjectId().toString(), username: 'test_ai_user', role: 'admin' }
            },
            ip: '127.0.0.1',
            get() { return 'MockAgent'; }
        };
        const resFallback = createMockResponse();

        await candController.generateAiTemplate(reqFallback, resFallback);
        console.log('Fallback AI Gen Status:', resFallback.statusCode);
        console.log('Fallback AI Gen Data:', resFallback.jsonData);

        // Verify the "AI Generated" category was automatically created and contains the card
        const fallbackCat = await Category.findOne({ title: 'AI Generated', lob: 'zomato' });
        console.log('Fallback category created:', fallbackCat ? 'Yes' : 'No');
        if (!fallbackCat) throw new Error('"AI Generated" category was not created');
        console.log('Fallback category templates count:', fallbackCat.templates.length);
        if (fallbackCat.templates.length !== 1) {
            throw new Error('Template not found in "AI Generated" category');
        }
        console.log('Fallback template isAi:', fallbackCat.templates[0].isAi);
        if (!fallbackCat.templates[0].isAi) {
            throw new Error('Fallback isAi property should be true');
        }

        // ─── CASE 3: Test AI Rephrase ───
        console.log('\n--- Test 3: Rephrase AI Canned Response (Mocked Success) ---');
        const originalRephrase = aiService.rephraseAiCannedResponse;
        aiService.rephraseAiCannedResponse = async (text) => {
            return `Rephrased professionally: ${text}`;
        };

        const reqRephrase = {
            body: { text: 'deliver order now please quick' },
            params: { lob: 'zomato' },
            session: { user: { id: new mongoose.Types.ObjectId().toString(), username: 'test_ai_user' } }
        };
        const resRephrase = createMockResponse();

        await candController.rephraseAiTemplate(reqRephrase, resRephrase);
        console.log('Rephrase Gen Status:', resRephrase.statusCode);
        console.log('Rephrase Gen Data:', resRephrase.jsonData);

        if (resRephrase.statusCode !== 200 || !resRephrase.jsonData.success || resRephrase.jsonData.text !== 'Rephrased professionally: deliver order now please quick') {
            throw new Error('Rephrase Failed');
        }

        // Restore original rephrase method
        aiService.rephraseAiCannedResponse = originalRephrase;

        // ─── CASE 4: Test Non-Editor AI Generation (Should not save to DB) ───
        console.log('\n--- Test 4: Generate AI Canned Response as Non-Editor ---');
        aiService.generateAiCannedResponse = async (scenario) => {
            return `Temporary AI Response for: ${scenario}`;
        };

        const reqNonEditor = {
            body: {
                tags: ['delayed_order', 'delivery_partner'],
                categoryId: testCategoryId
            },
            params: { lob: 'zomato' },
            session: {
                user: { id: new mongoose.Types.ObjectId().toString(), username: 'test_user_only', role: 'user' }
            },
            ip: '127.0.0.1',
            get() { return 'MockAgent'; }
        };
        const resNonEditor = createMockResponse();

        await candController.generateAiTemplate(reqNonEditor, resNonEditor);
        console.log('Non-Editor AI Gen Status:', resNonEditor.statusCode);
        console.log('Non-Editor AI Gen Data:', resNonEditor.jsonData);

        if (resNonEditor.statusCode !== 200 || resNonEditor.jsonData.saved !== false) {
            throw new Error('Non-Editor AI Generation failed or saved to DB unexpectedly');
        }

        // Verify it was NOT saved in Category templates
        const catSavedAgain = await Category.findById(testCategoryId);
        console.log('Category templates count after non-editor test:', catSavedAgain.templates.length);
        if (catSavedAgain.templates.length !== 1) {
            throw new Error('Template was saved under Category by non-editor user!');
        }

        // Restore original method
        aiService.generateAiCannedResponse = originalGenerateAiCannedResponse;

        // Clean up database test entries
        console.log('\nCleaning up database test entries...');
        await Category.deleteMany({ lob: 'zomato', title: { $in: ['AI Generated', 'Test Category AI'] } });
        console.log('Cleanup complete.');

        console.log('\n✅ ALL AI GENERATION & REPHRASE TESTS PASSED SUCCESSFULLY!');

    } catch (err) {
        console.error('❌ Test failed:', err);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
    }
}

runTests();
