const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../config/database');
const { Sop } = require('../models/Sop');
const zomatoSopController = require('../controllers/zomatoSopController');

// Mock response creator
function createMockResponse() {
    const res = {
        statusCode: 200,
        jsonData: null,
        sendData: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.jsonData = data;
            return this;
        },
        send(data) {
            this.sendData = data;
            return this;
        }
    };
    return res;
}

async function runTests() {
    try {
        console.log('Connecting to database...');
        await connectDB();
        console.log('Connected.');

        // 1. Test Category Creation
        console.log('\n--- Test 1: Create Category ---');
        const reqCreateCat = {
            body: { category: '09. TEST CATEGORY', phase: '(Phase: Test Run)' },
            user: { role: 'admin', username: 'testadmin' }
        };
        const resCreateCat = createMockResponse();
        await zomatoSopController.createCategory(reqCreateCat, resCreateCat);
        console.log('Create Category Response:', resCreateCat.jsonData);
        if (resCreateCat.statusCode !== 200 || !resCreateCat.jsonData.success) {
            throw new Error('Create Category Failed');
        }

        // Verify it exists in DB
        let placeholder = await Sop.findOne({ category: '09. TEST CATEGORY', lob: 'WIMO-AI-Handover' });
        console.log('Found created category placeholder card:', placeholder ? 'Yes' : 'No');
        if (!placeholder) throw new Error('Category placeholder not found in DB');

        // 2. Test Category Update
        console.log('\n--- Test 2: Update Category ---');
        const reqUpdateCat = {
            body: { oldCategory: '09. TEST CATEGORY', newCategory: '09. UPDATED TEST CATEGORY', phase: '(Phase: Test Run Updated)' },
            user: { role: 'admin', username: 'testadmin' }
        };
        const resUpdateCat = createMockResponse();
        await zomatoSopController.updateCategory(reqUpdateCat, resUpdateCat);
        console.log('Update Category Response:', resUpdateCat.jsonData);
        if (resUpdateCat.statusCode !== 200) throw new Error('Update Category Failed');

        // Verify updated category in DB
        placeholder = await Sop.findOne({ category: '09. UPDATED TEST CATEGORY', lob: 'WIMO-AI-Handover' });
        console.log('Found updated category placeholder card:', placeholder ? 'Yes' : 'No', 'Phase:', placeholder?.phase);
        if (!placeholder || placeholder.phase !== '(Phase: Test Run Updated)') {
            throw new Error('Updated category mismatch or not found');
        }

        // 3. Test Card Creation in Updated Category
        console.log('\n--- Test 3: Create Card ---');
        const reqCreateCard = {
            body: {
                category: '09. UPDATED TEST CATEGORY',
                phase: '(Phase: Test Run Updated)',
                title: 'Test Card A',
                condition: 'When testing',
                action: 'Wait 10 mins',
                details: '• Step 1\n• Step 2\n• Step 3',
                tags: 'test, card, a'
            },
            user: { role: 'admin', username: 'testadmin' }
        };
        const resCreateCard = createMockResponse();
        await zomatoSopController.createCard(reqCreateCard, resCreateCard);
        console.log('Create Card Response:', resCreateCard.jsonData);
        if (resCreateCard.statusCode !== 201) throw new Error('Create Card Failed');
        const cardAId = resCreateCard.jsonData.data._id;

        // 4. Test Card B Creation
        console.log('\n--- Test 4: Create Card B ---');
        const reqCreateCardB = {
            body: {
                category: '09. UPDATED TEST CATEGORY',
                phase: '(Phase: Test Run Updated)',
                title: 'Test Card B',
                condition: 'When testing B',
                action: 'Cancel',
                details: '• Step B1\n• Step B2',
                tags: 'test, card, b'
            },
            user: { role: 'admin', username: 'testadmin' }
        };
        const resCreateCardB = createMockResponse();
        await zomatoSopController.createCard(reqCreateCardB, resCreateCardB);
        console.log('Create Card B Response:', resCreateCardB.jsonData);
        if (resCreateCardB.statusCode !== 201) throw new Error('Create Card B Failed');
        const cardBId = resCreateCardB.jsonData.data._id;

        // 5. Test Card Update
        console.log('\n--- Test 5: Update Card A ---');
        const reqUpdateCard = {
            params: { id: cardAId },
            body: {
                title: 'Test Card A Updated',
                condition: 'When testing A condition updated',
                action: 'Wait 15 mins',
                details: '• Step 1 updated\n• Step 2 updated',
                tags: 'test, card, a, updated'
            },
            user: { role: 'admin', username: 'testadmin' }
        };
        const resUpdateCard = createMockResponse();
        await zomatoSopController.updateCard(reqUpdateCard, resUpdateCard);
        console.log('Update Card Response:', resUpdateCard.jsonData);
        if (resUpdateCard.statusCode !== 200) throw new Error('Update Card Failed');

        // 6. Test Card Reordering (Swap Card B up, Card A down)
        console.log('\n--- Test 6: Reorder Cards (Card B Up) ---');
        // Let's print their order values first
        let cardA = await Sop.findById(cardAId);
        let cardB = await Sop.findById(cardBId);
        console.log(`Before reorder: A.order=${cardA.order}, B.order=${cardB.order}`);

        const reqReorder = {
            body: { cardId: cardBId, direction: 'up' },
            user: { role: 'admin', username: 'testadmin' }
        };
        const resReorder = createMockResponse();
        await zomatoSopController.reorderCard(reqReorder, resReorder);
        console.log('Reorder Response:', resReorder.jsonData);
        if (resReorder.statusCode !== 200) throw new Error('Reorder Failed');

        cardA = await Sop.findById(cardAId);
        cardB = await Sop.findById(cardBId);
        console.log(`After reorder: A.order=${cardA.order}, B.order=${cardB.order}`);
        // B should have A's old order and A should have B's old order
        
        // 7. Test Card Delete
        console.log('\n--- Test 7: Delete Card A ---');
        const reqDeleteCard = {
            params: { id: cardAId },
            user: { role: 'admin', username: 'testadmin' }
        };
        const resDeleteCard = createMockResponse();
        await zomatoSopController.deleteCard(reqDeleteCard, resDeleteCard);
        console.log('Delete Card Response:', resDeleteCard.jsonData);
        if (resDeleteCard.statusCode !== 200) throw new Error('Delete Card Failed');

        // 8. Test Category Delete (deletes all remaining cards in this category, like B and placeholder)
        console.log('\n--- Test 8: Delete Category ---');
        const reqDeleteCat = {
            body: { category: '09. UPDATED TEST CATEGORY' },
            user: { role: 'admin', username: 'testadmin' }
        };
        const resDeleteCat = createMockResponse();
        await zomatoSopController.deleteCategory(reqDeleteCat, resDeleteCat);
        console.log('Delete Category Response:', resDeleteCat.jsonData);
        if (resDeleteCat.statusCode !== 200) throw new Error('Delete Category Failed');

        // Verify no cards remain in that category
        const count = await Sop.countDocuments({ category: '09. UPDATED TEST CATEGORY', lob: 'WIMO-AI-Handover' });
        console.log('Remaining cards in category in DB:', count);
        if (count > 0) throw new Error('Delete Category did not clear all cards');

        console.log('\n✅ ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');

    } catch (err) {
        console.error('❌ Test failed:', err);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
    }
}

runTests();
