const { generateTags } = require('../utils/autoTagGenerator');

const tests = [
    ['rain + traffic', 'The delivery partner is stuck in heavy traffic due to rain and waterlogging'],
    ['food not ready', 'The restaurant has not prepared the food yet, kitchen delay expected'],
    ['customer cancelled', 'The customer has cancelled the order'],
    ['device issue', 'Driver is unable to mark the order as delivered due to app issue'],
    ['vehicle breakdown', 'The rider had a flat tire and vehicle breakdown on the road'],
    ['blank input', ''],
    ['address mismatch', 'There is a customer address mismatch, hard to find the location'],
];

tests.forEach(([label, text]) => {
    const tags = generateTags(text);
    console.log(`\n[${label}]`);
    console.log('  Input:', text.slice(0, 70) + (text.length > 70 ? '...' : ''));
    console.log('  Tags :', tags);
});
