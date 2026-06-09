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

function isValidKey(key, provider) {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    if (trimmed === '' || trimmed.includes('your_') || trimmed.includes('placeholder')) return false;
    
    if (provider === 'gemini') {
        // Gemini API keys are Google API keys and start with AIzaSy
        return trimmed.startsWith('AIzaSy');
    }
    if (provider === 'openai') {
        // OpenAI API keys start with sk-
        return trimmed.startsWith('sk-');
    }
    return true;
}

/**
 * Generates a canned response text using either OpenAI or Gemini depending on key availability.
 */
async function generateAiCannedResponse(scenario) {
    const prompt = `Generate the response without using pronouns in simple english under 190chars for "${scenario}" scenario about the order delivery from restaurant via delivery partner to the customer. Do not return any extra text, only the generated response.`;

    const openAiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // Try OpenAI first if configured
    if (isValidKey(openAiKey, 'openai')) {
        try {
            console.log('[AI] Attempting response generation using OpenAI (ChatGPT)...');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAiKey.trim()}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 100,
                    temperature: 0.7
                })
            });
            if (response.ok) {
                const data = await response.json();
                let text = data.choices?.[0]?.message?.content?.trim();
                if (text) {
                    text = text.replace(/^["']|["']$/g, '').trim();
                    return text;
                }
            } else {
                const errText = await response.text();
                console.warn(`[AI] OpenAI API returned error status ${response.status}: ${errText}`);
            }
        } catch (err) {
            console.warn('[AI] OpenAI request failed, falling back if possible:', err.message);
        }
    }

    // Fall back to Gemini if configured
    if (isValidKey(geminiKey, 'gemini')) {
        try {
            console.log('[AI] Attempting response generation using Google Gemini...');
            const { GoogleGenerativeAI: GenAI } = require("@google/generative-ai");
            const ai = new GenAI(geminiKey.trim());
            const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            let text = result.response.text().trim();
            if (text) {
                text = text.replace(/^["']|["']$/g, '').trim();
                return text;
            }
        } catch (err) {
            console.error('[AI] Gemini request failed:', err.message);
            throw new Error(`AI Generation failed. Gemini Error: ${err.message}`);
        }
    }

    throw new Error('No valid AI API key found in .env. Please configure GEMINI_API_KEY (must start with AIzaSy) or OPENAI_API_KEY (must start with sk-).');
}

/**
 * Rephrases a canned response text professionally without pronouns under 190 characters in simple English.
 */
async function rephraseAiCannedResponse(originalText) {
    const prompt = `Rephrase this response professionally without using any pronouns under 190 chars in simple English: "${originalText}". Do not return any extra text, only the rephrased response.`;

    const openAiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // Try OpenAI first if configured
    if (isValidKey(openAiKey, 'openai')) {
        try {
            console.log('[AI] Attempting rephrasing using OpenAI (ChatGPT)...');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAiKey.trim()}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }],
                    max_tokens: 100,
                    temperature: 0.7
                })
            });
            if (response.ok) {
                const data = await response.json();
                let text = data.choices?.[0]?.message?.content?.trim();
                if (text) {
                    text = text.replace(/^["']|["']$/g, '').trim();
                    return text;
                }
            } else {
                const errText = await response.text();
                console.warn(`[AI] OpenAI API returned error status ${response.status}: ${errText}`);
            }
        } catch (err) {
            console.warn('[AI] OpenAI request failed during rephrase, falling back if possible:', err.message);
        }
    }

    // Fall back to Gemini if configured
    if (isValidKey(geminiKey, 'gemini')) {
        try {
            console.log('[AI] Attempting rephrasing using Google Gemini...');
            const { GoogleGenerativeAI: GenAI } = require("@google/generative-ai");
            const ai = new GenAI(geminiKey.trim());
            const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(prompt);
            let text = result.response.text().trim();
            if (text) {
                text = text.replace(/^["']|["']$/g, '').trim();
                return text;
            }
        } catch (err) {
            console.error('[AI] Gemini request failed during rephrase:', err.message);
            throw new Error(`AI Rephrase failed. Gemini Error: ${err.message}`);
        }
    }

    throw new Error('No valid AI API key found in .env. Please configure GEMINI_API_KEY (must start with AIzaSy) or OPENAI_API_KEY (must start with sk-).');
}

module.exports = { processFileToSop, generateAiCannedResponse, rephraseAiCannedResponse };