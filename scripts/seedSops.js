require('dotenv').config();
const connectDB = require('../config/database');
const { Sop } = require('../models/Sop');

async function seed() {
  await connectDB();

  const sample = [
    { lob: 'zomato', category: '01. PRE-PICKUP', title: 'MX Unresponsive', condition: 'Delay >40m & both DP/MX unresponsive', action: 'Cancel', tags: ['restaurant','unresponsive','delay'], status: 'Published', lastUpdated: { at: new Date(), by: 'seeder', role: 'system' } },
    { lob: 'zomato', category: '01. PRE-PICKUP', title: 'No DP Available', condition: 'Delay >30m in valet assignment', action: 'Cancel', tags: ['delivery','valet','delay'], status: 'Published', lastUpdated: { at: new Date(), by: 'seeder', role: 'system' } },
    { lob: 'zomato', category: '02. POST-PICKUP', title: 'DP Not Responding', condition: 'Picked up & DP not moving >30m', action: 'Escalate', tags: ['dp','unresponsive'], status: 'Published', lastUpdated: { at: new Date(), by: 'seeder', role: 'system' } },
    { lob: 'zomato', category: '02. POST-PICKUP', title: 'Spillage Issue', condition: 'Major/Full Damage', action: 'Cancel', tags: ['spillage','damage'], status: 'Published', lastUpdated: { at: new Date(), by: 'seeder', role: 'system' } },
    { lob: 'zomato', category: '03. MISC', title: 'Language Barrier', condition: 'DP cannot communicate', action: 'Escalate', tags: ['language','escalate'], status: 'Draft', lastUpdated: { at: new Date(), by: 'seeder', role: 'system' } },
    { lob: 'uber-eats', category: '01. PRE-PICKUP', title: 'Merchant Closed', condition: 'Merchant closed unexpectedly', action: 'Cancel', tags: ['merchant','closed'], status: 'Published', lastUpdated: { at: new Date(), by: 'seeder', role: 'system' } },
    { lob: 'uber-eats', category: '02. POST-PICKUP', title: 'Delivery Partner Late', condition: 'DP delayed >30m due to traffic', action: 'Wait', tags: ['dp','delay','traffic'], status: 'Published', lastUpdated: { at: new Date(), by: 'seeder', role: 'system' } },
    { lob: 'swiggy', category: '01. PRE-PICKUP', title: 'Missing Item', condition: 'Item not available at merchant', action: 'Cancel', tags: ['merchant','missing'], status: 'Published', lastUpdated: { at: new Date(), by: 'seeder', role: 'system' } }
  ];

  try {
    await Sop.deleteMany({ lob: 'zomato' });
    const created = await Sop.insertMany(sample);
    console.log('Seeded SOPs:', created.length);
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
