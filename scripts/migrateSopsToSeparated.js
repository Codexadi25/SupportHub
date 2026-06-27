const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../config/database');
const { Sop, SopTemplate } = require('../models/Sop');

async function migrate() {
    try {
        await connectDB();
        console.log('Database connected successfully.');

        const ejsPath = path.join(__dirname, '..', 'sop_panel.ejs');
        if (!fs.existsSync(ejsPath)) {
            console.error(`❌ sop_panel.ejs not found at ${ejsPath}`);
            process.exit(1);
        }

        console.log('Reading sop_panel.ejs...');
        const html = fs.readFileSync(ejsPath, 'utf8');

        // Extract categories and cards
        const categoryBlocks = html.split('<div class="category-block">');
        // The first block is header/boilerplate, ignore it.
        categoryBlocks.shift();

        const categories = [];
        const cardsToInsert = [];
        let overallOrder = 0;

        for (let i = 0; i < categoryBlocks.length; i++) {
            const block = categoryBlocks[i];
            
            // Extract category title and phase
            const titleMatch = block.match(/<div class="category-title">([^<]+)/);
            if (!titleMatch) continue;
            let catName = titleMatch[1].trim();
            
            // Clean up <span> elements in category title if present
            catName = catName.split('<span>')[0].trim();

            const phaseMatch = block.match(/<span>\(Phase:\s*([^)]+)\)<\/span>/i);
            const phase = phaseMatch ? phaseMatch[1].trim() : '';

            console.log(`Found category: "${catName}" | Phase: "${phase}"`);
            categories.push({
                name: catName,
                phase: phase,
                order: i
            });

            // Extract cards within this category block
            const cardBlocks = block.split(/<div class="sop-card"/);
            cardBlocks.shift(); // remove boilerplate preceding first card

            for (const cardBlock of cardBlocks) {
                const tagsMatch = cardBlock.match(/data-tags="([^"]*)"/);
                const tags = tagsMatch ? tagsMatch[1].split(/\s+/).map(t => t.trim()).filter(Boolean) : [];

                const headerMatch = cardBlock.match(/<div class="card-header">([^<]+)<\/div>/);
                const title = headerMatch ? headerMatch[1].trim() : 'Unnamed Card';

                const condMatch = cardBlock.match(/<div class="card-cond">([^<]+)<\/div>/);
                const condition = condMatch ? condMatch[1].trim() : '';

                // Extract action text
                const actionMatch = cardBlock.match(/<span class="action-tag[^>]*>([^<]+)<\/span>/);
                const action = actionMatch ? actionMatch[1].trim() : '';

                const detailsMatch = cardBlock.match(/<div class="card-detail-data" style="display:none">([\s\S]+?)<\/div>/);
                const details = detailsMatch ? detailsMatch[1].trim() : '';

                cardsToInsert.push({
                    lob: 'zomato',
                    category: catName,
                    title,
                    condition,
                    action,
                    details,
                    tags,
                    order: overallOrder++,
                    status: 'Published',
                    lastUpdated: {
                        at: new Date(),
                        by: 'system_migration',
                        role: 'admin'
                    }
                });
            }
        }

        // Clean up previous seeds for zomato
        console.log('Clearing existing Sop cards for zomato...');
        await Sop.deleteMany({ lob: 'zomato' });
        console.log('Clearing existing SopTemplate for zomato...');
        await SopTemplate.deleteMany({ lob: 'zomato' });

        // Insert new cards
        if (cardsToInsert.length > 0) {
            await Sop.insertMany(cardsToInsert);
            console.log(`🎉 Successfully migrated ${cardsToInsert.length} SOP cards.`);
        } else {
            console.log('⚠️ No cards found to migrate.');
        }

        // Insert Template
        const template = new SopTemplate({
            lob: 'zomato',
            headerImage: 'https://b.zmtcdn.com/web_assets/8313a97515fcb0447d2d77c276532a511583262271.png',
            sidebarConfig: {
                calculator: true,
                callingScript: '"Hi, Good Morning Sir, My name is XYZ from Zomato. May I know the reason for the delay and by when the order will be delivered?"',
                quickPrompts: [
                    { label: "Personal issue (tea/lunch/washroom)", text: "The delivery partner encountered an operational issue, so your order has been delayed. It will be delivered soon." },
                    { label: "Delay from MX, DP on way", text: "Order is delayed due to _____ issue at the restaurant and will be delivered shortly." },
                    { label: "Delay from DP, on way to deliver", text: "Order delayed by delivery partner due to _____; it will be delivered soon." },
                    { label: "Delay from MX, DP waiting at restaurant", text: "Order is delayed due to _____ issue at the restaurant. Delivery partner will pickup your order shortly." }
                ],
                recentUpdates: [
                    { date: "17-Apr-26", text: "Expected time guidelines updated — Post pickup: 10 mins, Valet not assigned: 10 mins, Food not ready: 10 mins, Mall order: 5 mins, Multi-order: 5 mins, Arriving soon: 5 mins. Scheduled orders: verify status matches current time; escalate if unclear. Non-logged-in DP delivery — escalate immediately." },
                    { date: "14-Apr-26", text: "Post-Pickup DP Reassigned (PPC) case added: Primary DP waiting = Arrival at CX + 10 mins ETA. Second DP on way = 5 mins + ETA. No need to ask delay reason in PPC." },
                    { date: "10-Apr-26", text: "Spillage policy confirmed — Minor: prompt only; Major/fully damaged: cancel regardless of delay. New compensation slabs effective: <30m = no comp; 30–45m = 35% OV (₹50–₹100); 45m+ = 100% OV (max ₹500)." },
                    { date: "Feb 20 (46073)", text: "Transfer tickets — check call logs first, listen to recordings, follow tracking details. No need to call again if recording available. If agent did not get info from call, next agent should call stakeholder to gather info." },
                    { date: "Feb 14 (46064)", text: "Valet not assigned — must mention time & status. Expected Time: ETA as per LL or up to 10 mins if not visible. Order Status Expected Time: Arrival at restaurant." },
                    { date: "Feb 8 (46063)", text: "Mandatory: mention order status, tracking details, and delay time in every ticket. In DP UR case — mention two tracking details (before & after calling DP)." },
                    { date: "Dec 27 (46057)", text: "Always mention expected time as per DP/MX VOC. Buffer up to 10 mins if food not ready and pickup waiting on Lifeline. PN must include: delay timing, tracking status, call connection status, any unusual observations. Prep End status if order under preparation." }
                ]
            },
            categories: categories
        });

        await template.save();
        console.log('🎉 Successfully created SopTemplate for zomato.');

    } catch (err) {
        console.error('❌ Error during migration:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
    }
}

migrate();
