const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Globally optimized for raw, lightning-fast text generation
const GeminiModel = genAI.getGenerativeModel({ 
    model: "gemini-3.1-flash-lite", 
    generationConfig: { 
        maxOutputTokens: 150 
    }
});

/**
 * Main wrapper utility to enforce a strict execution timeout window.
 */
function timeoutPromise(promise, ms, errorContext) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${errorContext} timed out after ${ms}ms`)), ms))
    ]);
}

/**
 * Main function to process files and generate SOP drafts.
 */
async function processFileToSop(fileBuffer, mimeType) {
    let extractedText = "";

    if (mimeType === 'application/pdf') {
        const data = await pdf(fileBuffer);
        extractedText = data.text;
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = result.value;
    } else if (mimeType.startsWith('image/')) {
        return await generateSopFromImage(fileBuffer, mimeType);
    } else {
        extractedText = fileBuffer.toString('utf8');
    }

    return await generateSopFromText(extractedText);
}

/**
 * Logic for Text-to-SOP (JSON structure enforcement).
 */
async function generateSopFromText(text) {
    const prompt = `Convert this raw text into a structured SOP JSON:
    { "title": "", "condition": "", "action": "Cancel/Escalate/Wait", "tags": [] }
    Data: ${text}`;

    const result = await timeoutPromise(
        GeminiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        }), 
        2500, 
        "Gemini SOP Text Core"
    );
    return JSON.parse(result.response.text());
}

/**
 * Logic for Image-to-SOP (JSON structure enforcement).
 */
async function generateSopFromImage(buffer, mimeType) {
    const imagePart = {
        inlineData: { data: buffer.toString("base64"), mimeType }
    };

    const prompt = "Read this SOP image and convert it to the JSON structure: Title, Condition, Action (Cancel/Escalate/Wait), and Tags.";
    
    const result = await timeoutPromise(
        GeminiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
            generationConfig: { responseMimeType: "application/json" }
        }), 
        4000, 
        "Gemini SOP Image Core"
    );
    return JSON.parse(result.response.text());
}

module.exports = {
    processFileToSop,
    generateSopFromText,
    generateSopFromImage,
    generateSopDraft: processFileToSop
};
