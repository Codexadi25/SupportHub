const { GoogleGenerativeAI } = require("@google/generative-ai");
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Main function to process files and generate SOP drafts
 */
async function processFileToSop(fileBuffer, mimeType) {
    let extractedText = "";

    // 1. Extract text based on file type
    if (mimeType === 'application/pdf') {
        const data = await pdf(fileBuffer);
        extractedText = data.text;
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = result.value;
    } else if (mimeType.startsWith('image/')) {
        // For images, we pass the buffer directly to Gemini's multimodal model
        return await generateSopFromImage(fileBuffer, mimeType);
    } else {
        // Plain text, RTF, etc.
        extractedText = fileBuffer.toString('utf8');
    }

    return await generateSopFromText(extractedText);
}

/**
 * Logic for Text-to-SOP
 */
async function generateSopFromText(text) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Convert this raw text into a structured SOP JSON:
    { "title": "", "condition": "", "action": "Cancel/Escalate/Wait", "tags": [] }
    Data: ${text}`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text().replace(/```json|```/g, ""));
}

/**
 * Logic for Image-to-SOP (OCR)
 */
async function generateSopFromImage(buffer, mimeType) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const imagePart = {
        inlineData: { data: buffer.toString("base64"), mimeType }
    };

    const prompt = "Read this SOP image and convert it to the JSON structure: Title, Condition, Action (Cancel/Escalate/Wait), and Tags.";
    const result = await model.generateContent([prompt, imagePart]);
    return JSON.parse(result.response.text().replace(/```json|```/g, ""));
}

module.exports = { processFileToSop };