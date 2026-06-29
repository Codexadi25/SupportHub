const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const User = require('../../models/User');
const AiChatSession = require('../../models/AiChatSession');
const { Sop } = require('../../models/Sop');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); 

// Utility to calculate daily tokens and check limits
async function checkAndChargeTokens(user, tokensToCharge) {
    if (user.role === 'admin') return true; // Admins have no limit
    
    const today = new Date().toISOString().split('T')[0];
    
    // Reset if it's a new day
    if (user.aiTokensDate !== today) {
        user.aiTokensDate = today;
        user.aiTokensUsedToday = 0;
    }

    if (user.aiTokensUsedToday >= 1000) {
        return false; // Limit exceeded
    }

    user.aiTokensUsedToday += tokensToCharge;
    await user.save();
    return true;
}

// GET Chat History
router.get('/history', async (req, res) => {
    try {
        let session = await AiChatSession.findOne({ user: req.user._id });
        if (!session) {
            session = new AiChatSession({ user: req.user._id, messages: [] });
            await session.save();
        }
        
        let msgs = session.messages || [];
        const limit = parseInt(req.query.limit) || msgs.length;
        if (limit < msgs.length) {
            msgs = msgs.slice(msgs.length - limit);
        }
        
        res.json({ messages: msgs });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// DELETE Chat History (Clear)
router.delete('/history', async (req, res) => {
    try {
        await AiChatSession.findOneAndUpdate(
            { user: req.user._id },
            { $set: { messages: [] } }
        );
        res.json({ message: 'History cleared' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to clear history' });
    }
});

// POST Chat Message
router.post('/chat', async (req, res) => {
    try {
        const { prompt, replyTo } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        const user = await User.findById(req.user._id);

        // Pre-flight check for tokens
        const today = new Date().toISOString().split('T')[0];
        if (user.role !== 'admin' && user.aiTokensDate === today && user.aiTokensUsedToday >= 1000) {
            return res.status(429).json({ error: 'Daily token limit (1000 words) exceeded.' });
        }

        // 1. Context Generation (Vector DB Search)
        let contextText = '';
        try {
            if (process.env.GEMINI_API_KEY) {
                // Generate embedding for the user's prompt
                const embedRes = await ai.models.embedContent({
                    model: 'text-embedding-004',
                    contents: prompt
                });
                
                const vector = embedRes.embeddings[0].values;
                
                // MongoDB Atlas Vector Search for SOP context
                const searchResults = await Sop.aggregate([
                    {
                        "$vectorSearch": {
                            "index": "vector_index", // Name of the Atlas search index
                            "path": "embedding",
                            "queryVector": vector,
                            "numCandidates": 50,
                            "limit": 3
                        }
                    },
                    {
                        "$project": { "title": 1, "condition": 1, "action": 1, "details": 1, "score": { "$meta": "vectorSearchScore" } }
                    }
                ]);

                if (searchResults && searchResults.length > 0) {
                    contextText = searchResults.map(sop => `Title: ${sop.title}\nCondition: ${sop.condition}\nAction: ${sop.action}\nDetails: ${sop.details}`).join('\n\n');
                }
            }
        } catch (vectorError) {
            console.warn('Vector Search failed (likely missing Atlas index), proceeding without DB context:', vectorError.message);
        }

        // 2. Fetch History
        let session = await AiChatSession.findOne({ user: user._id });
        if (!session) {
            session = new AiChatSession({ user: user._id, messages: [] });
        }

        const historyContents = session.messages.map(m => ({
            role: m.role === 'model' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        let finalPrompt = prompt;
        if (replyTo) {
            finalPrompt = `[Replying to previous message: "${replyTo}"]\n\n${prompt}`;
        }

        const systemPrompt = `You are Veronica AI, a virtual assistant for an enterprise support application.
Your goal is to assist users with business purposes only. Use the provided SOP Context to answer questions if relevant.
SOP Context:
${contextText ? contextText : 'No context found.'}`;

        // Add the new user message to history
        historyContents.push({ role: 'user', parts: [{ text: finalPrompt }] });
        session.messages.push({ role: 'user', content: finalPrompt });

        // 3. Generate Content
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: historyContents,
            config: {
                systemInstruction: systemPrompt
            }
        });

        const replyText = response.text;
        
        // 4. Token Accounting
        const tokensGenerated = response.usageMetadata?.candidatesTokenCount || replyText.split(' ').length;
        const allowed = await checkAndChargeTokens(user, tokensGenerated);
        
        if (!allowed) {
            // Revert message addition if they exceeded during generation?
            // Usually we still return it but tell them they're blocked for next time.
        }

        session.messages.push({ role: 'model', content: replyText });
        await session.save();

        res.json({ reply: replyText, tokensUsed: user.aiTokensUsedToday });
    } catch (error) {
        console.error('Veronica AI Error:', error);
        res.status(500).json({ error: 'Failed to generate response' });
    }
});

// Enhance Text Endpoint
router.post('/enhance', async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const { text, instruction } = req.body;
        
        if (!text) return res.status(400).json({ error: 'Text is required' });

        const prompt = `${instruction || 'Please enhance and professionally format the following text. Provide ONLY the enhanced text, nothing else:'}\n\n${text}`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });

        const replyText = response.text;
        
        const tokensGenerated = response.usageMetadata?.candidatesTokenCount || replyText.split(' ').length;
        await checkAndChargeTokens(user, tokensGenerated);

        res.json({ reply: replyText });
    } catch (error) {
        console.error('AI Enhance Error:', error);
        res.status(500).json({ error: 'Failed to enhance text' });
    }
});

// Generate Briefing Endpoint
router.post('/generate-briefing', async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const { instruction } = req.body;
        
        if (!instruction) return res.status(400).json({ error: 'Instruction is required' });

        const prompt = `You are an expert at creating beautiful, highly professional SOPs and Daily Briefings. 
Create a concise briefing or SOP update based on the following instruction:
"${instruction}"

Requirements:
- Ensure the content is POINT-WISE and concise (use bullet points or numbered lists). Do NOT write a long, verbose essay or a complete document.
- Generate a single HTML <div> element containing the briefing.
- DO NOT generate a full HTML web page (no <html>, <head>, or <body> tags).
- Include minimal inline or internal CSS (<style> tags inside the div) to provide structure and make it look sleek and modern.
- Ensure smooth scrolling where needed inside your elements.
- Return ONLY valid HTML. Do not return Markdown code blocks (like \`\`\`html).
- The final output must be ready to be injected directly as an HTML chunk.`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });

        let replyText = response.text;
        
        // Strip markdown blocks if the AI stubbornly adds them
        if (replyText.startsWith('```html')) {
            replyText = replyText.replace(/^```html\s*/i, '');
            replyText = replyText.replace(/\s*```$/i, '');
        }

        const tokensGenerated = response.usageMetadata?.candidatesTokenCount || replyText.split(' ').length;
        await checkAndChargeTokens(user, tokensGenerated);

        res.json({ reply: replyText });
    } catch (error) {
        console.error('AI Generate Briefing Error:', error);
        res.status(500).json({ error: 'Failed to generate briefing' });
    }
});

module.exports = router;