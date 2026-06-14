const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testKey(keyName, key) {
    console.log(`Testing key: ${keyName} = ${key}`);
    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });
        const prompt = "Say hello in 5 words.";
        const result = await model.generateContent(prompt);
        console.log('Response:', result.response.text().trim());
        console.log(`Key ${keyName} is VALID for Gemini!`);
    } catch (err) {
        console.error(`Key ${keyName} is INVALID for Gemini:`, err.message);
    }
}

async function run() {
    await testKey('GEMINI_API_KEY', process.env.GEMINI_API_KEY);
    await testKey('FIREBASE_API_KEY', process.env.FIREBASE_API_KEY);
}

run();
