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

// Full status tag keyword dictionary mapping system keys to human contexts
const TAG_KEYWORDS = {
    address_issue:          ['incorrect address', 'wrong address', 'location issue', 'address problem', 'hard to find', 'facing difficulty', 'address', 'location'],
    arrival_cx:             ['arriving customer', 'reaching customer', 'going to customer', 'arriving', 'reaching', 'towards customer'],
    arrival_res:            ['arriving restaurant', 'reaching restaurant', 'going to restaurant', 'arriving', 'reaching', 'towards restaurant'],
    arrived:                ['arrived', 'near gate', 'near entrance', 'geofence', 'nearby', 'near location', 'close to'],
    arriving_soon:          ['arriving soon', 'on the way', 'almost there', 'reaching soon'],
    assignment_delay:       ['assignment delay', 'assigning partner', 'no delivery partner', 'partner delay', 'late assignment'],
    awaiting_pickup:        ['awaiting pickup', 'waiting for pickup', 'waiting at restaurant'],
    batched:                ['batched order', 'multiple deliveries', 'grouped delivery'],
    battery:                ['battery dead', 'battery low', 'battery issue', 'battery'],
    bill:                   ['bill', 'invoice', 'billing issue', 'token', 'printing bill'],
    cancelation:            ['cancel order', 'order cancelled', 'cancellation', 'cancelled'],
    check_post:             ['checkpoint', 'security check', 'police check', 'guard', 'check post'],
    closed_mx:              ['restaurant closed', 'outlet closed', 'store closed'],
    cx_address_missmatch:   ['customer address mismatch', 'wrong customer address', 'address mismatch', 'location mismatch'],
    cx_canceled:            ['cancelled by customer', 'customer cancelled', 'customer canceled'],
    damaged:                ['damaged item', 'damaged order', 'damaged food', 'damaged'],
    delivered:              ['order delivered', 'successfully delivered', 'delivered'],
    device_issues:          ['unable to mark delivered', 'unable to mark picked', 'app issue', 'gps issue', 'phone issue', 'device issues'],
    dp_issue:               ['delivery partner issue', 'driver issue', 'rider problem', 'traffic issue', 'vehicle problem'],
    dp_mx_ur:               ['partner unresponsive at restaurant', 'delivery partner unresponsive restaurant'],
    dp_ur:                  ['delivery partner unresponsive', 'driver unresponsive', 'partner not responding'],
    electricity:            ['power cut', 'electricity issue', 'no electricity', 'electric failure'],
    exchange:               ['exchange order', 'replacement', 'exchange item'],
    fog:                    ['fog', 'foggy', 'low visibility fog'],
    food_not_prepared:      ['food not prepared', 'not ready yet', 'preparation delay', 'food prep delay', 'kitchen delay', 'still preparing', 'being prepared'],
    forgot_pickup:          ['forgot to pick', 'forgot pickup', 'forgot order', 'forgot to pick up'],
    fuel:                   ['fuel issue', 'out of fuel', 'no fuel', 'fuel problem', 'fuel'],
    gas:                    ['gas problem', 'gas issue', 'gas leak', 'gas'],
    grouped:                ['grouped order', 'batched delivery', 'grouped deliveries'],
    just_assigned:          ['just assigned', 'newly assigned', 'recently assigned'],
    kitchen_full:           ['kitchen full', 'kitchen overloaded', 'kitchen at capacity'],
    long_distance:          ['long distance', 'far location', 'long route'],
    mx_address_mismatch:    ['restaurant address mismatch', 'wrong restaurant address', 'incorrect restaurant location'],
    mx_closed:              ['restaurant closed', 'merchant closed'],
    mx_issues:              ['restaurant not accepting', 'out of stock at restaurant', 'merchant issue'],
    item_out_of_stock:      ['out of stock', 'item not available', 'unavailable item', 'missing item'],
    network_issues:         ['network issue', 'no internet', 'connectivity issue', 'poor network', 'network problem'],
    on_time:                ['on time', 'delivered on time', 'arrived on time'],
    packing:                ['packing delay', 'still packing', 'being packed', 'packing issue'],
    picked_by_another_dp:   ['picked by another partner', 'wrong partner picked', 'another dp picked'],
    pickup_mistake:         ['wrong order picked', 'picked wrong food', 'pickup mistake', 'mistakenly picked', 'wrong item picked'],
    poor_road:              ['bad road', 'potholes', 'road damage', 'road construction', 'poor road condition'],
    power_cut:              ['power cut', 'no power', 'electricity cut', 'power outage', 'power shortfall'],
    preparation_delay:      ['preparation delay', 'food taking long', 'slow preparation'],
    railway_crossing:       ['railway crossing', 'train crossing', 'level crossing'],
    rain_affected:          ['rain affected', 'heavy rain', 'rain', 'flood', 'storm', 'waterlogged due to rain'],
    reassignment:           ['reassigned', 'transfer order', 'reassigning', 'order transferred'],
    road_blocked:           ['road blocked', 'road closure', 'blocked road'],
    rush:                   ['rush hour', 'busy time', 'peak rush', 'rush'],
    snatched:               ['order snatched', 'item snatched', 'snatched'],
    strike:                 ['strike', 'bandh', 'work stoppage'],
    traffic:                ['heavy traffic', 'traffic jam', 'traffic congestion', 'roadblock', 'traffic'],
    transfer_order:         ['order transferred', 'previous partner', 'previous dp', 'reassigned partner'],
    unable_to_mark_delivered: ['unable to mark delivered', 'cannot mark delivered', 'not able to mark delivered'],
    unresponsive:           ['unresponsive', 'not responding', 'no response'],
    unsafe:                 ['unsafe area', 'not safe', 'dangerous area', 'unsafe'],
    vehicle_issue:          ['vehicle breakdown', 'flat tire', 'engine trouble', 'accident', 'vehicle issue', 'breakdown'],
    waterlogging:           ['waterlogging', 'water logged', 'flooded road', 'waterlogged'],
    wrong_order:            ['wrong order', 'incorrect order', 'wrong food delivered'],
    test_tag:               ['test case', 'bug testing', 'feature testing', 'testing', 'bugs']
};

/**
 * Maps system tags to operational phrases using the keywords dictionary.
 */
function expandTagsToNarrative(tags = []) {
    return tags.map(tag => {
        if (TAG_KEYWORDS[tag]) {
            return `${tag.replace(/_/g, ' ')} (${TAG_KEYWORDS[tag][0]})`;
        }
        return tag.replace(/_/g, ' ');
    }).join(', ');
}

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

/**
 * API Key structural validation engine.
 */
function isValidKey(key, provider) {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    if (trimmed === '' || trimmed.includes('your_') || trimmed.includes('placeholder')) return false;
    
    if (provider === 'gemini') {
        return trimmed.startsWith('AIzaSy') || trimmed.startsWith('AQ.');
    }
    if (provider === 'openai') {
        return trimmed.startsWith('sk-');
    }
    return true;
}

/**
 * Helper to retrieve permitted words list constraint from database.
 */
async function getVocabularyPromptConstraint() {
    try {
        const PermittedWord = require('../models/PermittedWord');
        const activeWords = await PermittedWord.find({ isActive: true });
        if (activeWords && activeWords.length > 0) {
            const wordsList = activeWords.map(d => d.word).join(', ');
            return `\n\nCRITICAL VOCABULARY CONSTRAINT:
You MUST ONLY construct your response using words from the permitted vocabulary list below, or their close grammatical variations (like plurals, singulars, and tenses).
Permitted Vocabulary List:
[${wordsList}]
You may also use standard English function words/auxiliaries/pronouns (like: the, a, is, are, was, were, to, for, in, on, at, by, with, from, of, and, or, but, if, this, that, it, they, we, he, she, you, i, me, my, your, will, would, can, could, do, does, did, have, has, had, not, welcome, please, hello, hi, thanks, thank, sorry).
Do NOT use any other nouns, verbs, adjectives, or adverbs. If you violate this rule, your response will be rejected.`;
        }
    } catch (err) {
        console.error('[AI Vocab] Failed to fetch permitted vocabulary:', err.message);
    }
    return "";
}

/**
 * Underlying helper to execute the AI call across providers.
 */
async function executeAiGeneration(basePrompt, retryWarning = "") {
    const fullPrompt = basePrompt + (retryWarning ? `\n\nWARNING CORRECTION ORDER:\n${retryWarning}` : "");
    const openAiKey = process.env.OPENAI_API_KEY || process.env.CHATGPT_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // STEP 1: Execute primary Gemini path
    if (isValidKey(geminiKey, 'gemini')) {
        try {
            console.log('[AI] Primary Target: Requesting Gemini Flash Lite...');
            const result = await timeoutPromise(GeminiModel.generateContent(fullPrompt), 1500, "Gemini Canned Generation");
            let text = result.response.text().trim();
            if (text) {
                return text.replace(/^["']|["']$/g, '').trim();
            }
        } catch (err) {
            console.warn(`[AI Warning] Gemini failed or lagged (${err.message}). Activating fallback sequence...`);
        }
    }

    // STEP 2: Execute redundant fallback OpenAI route
    if (isValidKey(openAiKey, 'openai')) {
        try {
            console.log('[AI Failover] Executing secondary backup request via OpenAI...');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openAiKey.trim()}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: fullPrompt }],
                    max_tokens: 60,
                    temperature: 0.4
                })
            });

            if (response.ok) {
                const data = await response.json();
                let text = data.choices?.[0]?.message?.content?.trim();
                if (text) {
                    return text.replace(/^["']|["']$/g, '').trim();
                }
            } else {
                const errText = await response.text();
                console.error(`[AI Critical] OpenAI Fallback rejected transaction: ${errText}`);
            }
        } catch (err) {
            console.error('[AI Critical] Network failure. Entire infrastructure channel down:', err.message);
        }
    }

    throw new Error('All primary and redundant AI generations failed or exceeded safe production performance latency windows.');
}

/**
 * Dynamic chat intelligence matrix addressing "Where Is My Order" queries.
 * Handles operational delay reasons, delivery time evaluations, closures, and cancellations.
 * * @param {Object} scenarioData 
 * @param {string} scenarioData.title - Core descriptive scenario title
 * @param {Array<string>} scenarioData.tags - Active system event keys (e.g., ["unresponsive", "traffic"])
 * @param {string} scenarioData.customerImpact - Explicit resolution detail, why it's delayed, or time remaining
 */
async function generateAiCannedResponse(scenarioData, customPrompt = null) {
    let basePrompt;
    const vocabConstraint = await getVocabularyPromptConstraint();

    if (customPrompt) {
        basePrompt = customPrompt + vocabConstraint;
    } else {
        let scenarioText = "";
        if (typeof scenarioData === 'string') {
            scenarioText = `Event Context: ${scenarioData}`;
        } else if (scenarioData && typeof scenarioData === 'object') {
            const tagsString = scenarioData.tags && Array.isArray(scenarioData.tags) ? expandTagsToNarrative(scenarioData.tags) : 'None';
            scenarioText = `Customer Query: Where Is My Order (WISMO)\n- Event Summary: ${scenarioData.title || ''}\n- Logistics Status Flags: [${tagsString}]\n- Resolution Data (Why delayed / Time details / Termination reasons): ${scenarioData.customerImpact || ''}`;
        } else {
            scenarioText = "Event Context: Unknown delivery status";
        }

        basePrompt = `System Instruction: You are an automated customer service chat assistance engine answering WISMO (Where Is My Order) updates for an online delivery platform. Formulate a smooth, connected response explaining the exact delay reasons, remaining delivery time, or terminal cancellation state based strictly on the scenario data. Do not use robotic bullet points or broken fragments.

Rules:
1. Length: MUST be under 190 characters total.
2. Grammar: Avoid using pronouns completely (No "I", "We", "You", "Our", "They", "He", "She", "It").
3. Format: Do not wrap the output in quotes, markdown, or JSON fields. Return ONLY the plain text phrase.
4. Tone: Helpful, highly professional, connected, and clear.

Scenario Data:
- ${scenarioText}

Generate a concise, connected explanation phrase adhering to the rules above:${vocabConstraint}`;
    }

    const { validateTextAgainstPermitted } = require('../utils/permittedWordManager');
    let retryWarning = "";
    let finalOutput = "";

    for (let attempt = 0; attempt <= 2; attempt++) {
        try {
            finalOutput = await executeAiGeneration(basePrompt, retryWarning);
        } catch (err) {
            if (attempt === 2) throw err;
            console.warn(`[AI Warning] Generation error on attempt ${attempt + 1}, retrying...`);
            continue;
        }
        
        // Post-generation compliance validation
        const validation = await validateTextAgainstPermitted(finalOutput);
        if (validation.isValid) {
            console.log(`[AI Validation] Generated response is valid and permitted: "${finalOutput}"`);
            return finalOutput;
        }

        console.warn(`[AI Validation Warning] Attempt ${attempt + 1} generated unpermitted words: [${validation.violatedWords.join(', ')}]. Regenerating...`);
        retryWarning = `Your previous draft: "${finalOutput}" was REJECTED because it used unpermitted words: [${validation.violatedWords.join(', ')}]. Rewrite the update text strictly using ONLY words from the permitted vocabulary list.`;
    }

    console.error(`[AI Validation Failed] Exhausted retries. Returning best-effort response: "${finalOutput}"`);
    return finalOutput;
}

/**
 * Rephrases an existing string text payload professionally under strict latency controls.
 */
async function rephraseAiCannedResponse(originalText) {
    const vocabConstraint = await getVocabularyPromptConstraint();

    const basePrompt = `Rephrase professionally without using pronouns under 190 chars in simple English: "${originalText}". Do not wrap the output in JSON or quotes. Return ONLY the plain text phrase.${vocabConstraint}`;

    const { validateTextAgainstPermitted } = require('../utils/permittedWordManager');
    let retryWarning = "";
    let finalOutput = "";

    for (let attempt = 0; attempt <= 2; attempt++) {
        try {
            finalOutput = await executeAiGeneration(basePrompt, retryWarning);
        } catch (err) {
            if (attempt === 2) throw err;
            console.warn(`[AI Warning] Rephrase error on attempt ${attempt + 1}, retrying...`);
            continue;
        }
        
        const validation = await validateTextAgainstPermitted(finalOutput);
        if (validation.isValid) {
            console.log(`[AI Validation] Rephrased response is valid and permitted: "${finalOutput}"`);
            return finalOutput;
        }

        console.warn(`[AI Validation Warning] Attempt ${attempt + 1} generated unpermitted words during rephrasal: [${validation.violatedWords.join(', ')}]. Regenerating...`);
        retryWarning = `Your previous draft: "${finalOutput}" was REJECTED because it used unpermitted words: [${validation.violatedWords.join(', ')}]. Rephrase strictly using ONLY words from the permitted vocabulary list.`;
    }

    console.error(`[AI Validation Failed] Exhausted retries for rephrase. Returning best-effort: "${finalOutput}"`);
    return finalOutput;
}

module.exports = {
  processFileToSop,
  generateAiCannedResponse,
  rephraseAiCannedResponse,
  generateSopDraft: processFileToSop
};