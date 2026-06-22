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
        
        // Seed default tags and prompt templates for Zomato LOB
        try {
            const Tag = require('../models/Tag');
            const Prompt = require('../models/Prompt');
            const User = require('../models/User');

            // Find an admin user to assign as owner/creator of seeded tags/prompts
            const adminUser = await User.findOne({ role: 'admin' });
            const adminId = adminUser ? adminUser._id : null;

            // Default WISMO Zomato tags
            const defaultTags = [
                'Address incorrect',
                'Delivery partner delayed',
                'Food preparing slowly',
                'Customer unresponsive',
                'Strike / Bad Weather',
                'Heavy traffic',
                'Geofence reached',
                'Battery dead',
                'Out of fuel',
                'App issue'
            ];

            for (const tagName of defaultTags) {
                const existing = await Tag.findOne({ name: tagName });
                if (!existing) {
                    await Tag.create({
                        name: tagName,
                        visibility: 'public',
                        owner: adminId
                    });
                }
            }

            // Default Zomato Prompt
            const defaultPromptTemplate = `System Instruction: You are an automated customer service chat assistance engine answering WISMO (Where Is My Order) updates for Zomato delivery platform. Formulate a smooth, connected response explaining the exact delay reasons, remaining delivery time, or terminal cancellation state based strictly on the scenario data. Do not use robotic bullet points or broken fragments.

Rules:
1. Length: MUST be under 190 characters total.
2. Grammar: Avoid using pronouns completely (No "I", "We", "You", "Our", "They", "He", "She", "It").
3. Format: Do not wrap the output in quotes, markdown, or JSON fields. Return ONLY the plain text phrase.
4. Tone: Helpful, highly professional, connected, and clear.

Scenario Data:
- Selected Tags: {{selectedTags}}
- Additional Context: {{extraContext}}

Generate a concise, connected explanation phrase adhering to the rules above.`;

            const promptExists = await Prompt.findOne({ lob: 'zomato' });
            if (!promptExists) {
                await Prompt.create({
                    lob: 'zomato',
                    template: defaultPromptTemplate
                });
            }
            console.log('Successfully completed default AI Cands tag and prompt seeding.');

            // Sync permitted words on boot to ensure vocabulary is populated/updated
            console.log('[Boot Sync] Triggering permitted words synchronization...');
            const wordManager = require('../utils/permittedWordManager');
            const syncStats = await wordManager.syncWordsFromDatabase();
            console.log(`[Boot Sync] Synchronized permitted words. Created: ${syncStats.created}, Updated: ${syncStats.updated}`);
        } catch (seedErr) {
            console.error('Error during default AI Cands tag/prompt seeding/sync:', seedErr.message);
        }
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;