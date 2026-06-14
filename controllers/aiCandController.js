const Tag = require('../models/Tag');
const Prompt = require('../models/Prompt');
const AiCand = require('../models/AiCand');
const { generateAiCannedResponse } = require('../services/aiService');
const Logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');

// TAGS CONTROLLER
exports.getTags = asyncHandler(async (req, res) => {
    const lob = req.params.lob || 'zomato';
    const userId = req.session.user.id || req.session.user._id;

    // Get public tags for LOB, or private tags for LOB owned by current user
    const tags = await Tag.find({
        $or: [
            { visibility: 'public' },
            { visibility: 'private', owner: userId }
        ]
    }).sort({ name: 1 });

    res.json({ success: true, tags });
});

exports.createTag = asyncHandler(async (req, res) => {
    const lob = req.params.lob || 'zomato';
    const userId = req.session.user.id || req.session.user._id;
    const { name, visibility } = req.body;

    if (!name || !name.trim()) {
        res.status(400);
        throw new Error('Tag name is required');
    }

    // Force regular users to only create private tags
    let finalVisibility = 'private';
    if (req.session.user.role === 'admin' && visibility === 'public') {
        finalVisibility = 'public';
    }

    // Check if tag with same name already exists (case-insensitive)
    const normalizedName = name.trim();
    const query = {
        name: { $regex: new RegExp('^' + normalizedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$', 'i') }
    };
    
    // If private, only check within user's own tags or public tags
    if (finalVisibility === 'private') {
        query.$or = [
            { visibility: 'public' },
            { visibility: 'private', owner: userId }
        ];
    }

    const existingTag = await Tag.findOne(query);
    if (existingTag) {
        res.status(400);
        throw new Error(`Tag "${normalizedName}" already exists`);
    }

    const newTag = await Tag.create({
        name: normalizedName,
        visibility: finalVisibility,
        owner: userId
    });

    res.status(201).json({ success: true, tag: newTag });
});

exports.updateTag = asyncHandler(async (req, res) => {
    const userId = req.session.user.id || req.session.user._id;
    const { name, visibility } = req.body;
    const tagId = req.params.id;

    const tag = await Tag.findById(tagId);
    if (!tag) {
        res.status(404);
        throw new Error('Tag not found');
    }

    // Only creator/owner or admin can modify
    if (tag.owner.toString() !== userId.toString() && req.session.user.role !== 'admin') {
        res.status(403);
        throw new Error('Not authorized to modify this tag');
    }

    if (name && name.trim()) {
        tag.name = name.trim();
    }

    if (req.session.user.role === 'admin' && visibility) {
        tag.visibility = visibility;
    }

    await tag.save();
    res.json({ success: true, tag });
});

exports.deleteTag = asyncHandler(async (req, res) => {
    const userId = req.session.user.id || req.session.user._id;
    const tagId = req.params.id;

    const tag = await Tag.findById(tagId);
    if (!tag) {
        res.status(404);
        throw new Error('Tag not found');
    }

    // Only creator/owner or admin can delete
    if (tag.owner.toString() !== userId.toString() && req.session.user.role !== 'admin') {
        res.status(403);
        throw new Error('Not authorized to delete this tag');
    }

    await Tag.findByIdAndDelete(tagId);
    res.json({ success: true, message: 'Tag deleted successfully' });
});

// PROMPT CONTROLLER
exports.getPrompt = asyncHandler(async (req, res) => {
    const lob = req.params.lob || 'zomato';
    let prompt = await Prompt.findOne({ lob });
    
    // Default fallback prompt if none exists in db
    if (!prompt) {
        const defaultTemplate = `System Instruction: You are an automated customer service chat assistance engine answering WISMO (Where Is My Order) updates for an online delivery platform. Formulate a smooth, connected response explaining the exact delay reasons, remaining delivery time, or terminal cancellation state based strictly on the scenario data. Do not use robotic bullet points or broken fragments.

Rules:
1. Length: MUST be under 190 characters total.
2. Grammar: Avoid using pronouns completely (No "I", "We", "You", "Our", "They", "He", "She", "It").
3. Format: Do not wrap the output in quotes, markdown, or JSON fields. Return ONLY the plain text phrase.
4. Tone: Helpful, highly professional, connected, and clear.

Scenario Data:
- Selected Tags: {{selectedTags}}
- Additional Context: {{extraContext}}

Generate a concise, connected explanation phrase adhering to the rules above.`;
        prompt = await Prompt.create({ lob, template: defaultTemplate });
    }

    res.json({ success: true, prompt: prompt.template });
});

exports.updatePrompt = asyncHandler(async (req, res) => {
    const lob = req.params.lob || 'zomato';
    const { template } = req.body;

    if (!template || !template.trim()) {
        res.status(400);
        throw new Error('Prompt template is required');
    }

    let prompt = await Prompt.findOne({ lob });
    if (prompt) {
        prompt.template = template;
        await prompt.save();
    } else {
        prompt = await Prompt.create({ lob, template });
    }

    // Log database change
    await Logger.logDatabaseChange('UPDATE', 'Prompt', prompt._id.toString(), null, { template }, req.session.user.id, req.session.user.username, {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });

    res.json({ success: true, prompt: prompt.template });
});

// ADMIN CANNED RESPONSES (AiCand) CONTROLLER
exports.getAdminCands = asyncHandler(async (req, res) => {
    const lob = req.params.lob || 'zomato';
    const userId = req.session.user.id || req.session.user._id;

    const cands = await AiCand.find({ lob }).populate('tags');

    // Sort by user's specific ordering
    cands.sort((a, b) => {
        const orderA = a.userOrders.find(uo => uo.user.toString() === userId.toString())?.order ?? 9999;
        const orderB = b.userOrders.find(uo => uo.user.toString() === userId.toString())?.order ?? 9999;
        return orderA - orderB;
    });

    res.json({ success: true, cands });
});

exports.createAdminCand = asyncHandler(async (req, res) => {
    const lob = req.params.lob || 'zomato';
    const userId = req.session.user.id || req.session.user._id;
    const { text, tagIds } = req.body;

    if (!text || !text.trim()) {
        res.status(400);
        throw new Error('Canned response text is required');
    }

    const newCand = await AiCand.create({
        lob,
        text: text.trim(),
        tags: tagIds || [],
        createdBy: userId,
        isAdminCreated: true
    });

    // Populate tags for response
    await newCand.populate('tags');

    // Log database change
    await Logger.logDatabaseChange('CREATE', 'AiCand', newCand._id.toString(), null, { text, tagIds }, userId, req.session.user.username, {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });

    res.status(201).json({ success: true, cand: newCand });
});

exports.updateAdminCand = asyncHandler(async (req, res) => {
    const userId = req.session.user.id || req.session.user._id;
    const { text, tagIds } = req.body;
    const candId = req.params.id;

    const cand = await AiCand.findById(candId);
    if (!cand) {
        res.status(404);
        throw new Error('Canned response not found');
    }

    // Only Admin can edit admin cands
    if (req.session.user.role !== 'admin') {
        res.status(403);
        throw new Error('Admin privileges required to edit this canned response');
    }

    const oldData = { text: cand.text, tags: cand.tags };

    if (text && text.trim()) {
        cand.text = text.trim();
    }
    if (tagIds) {
        cand.tags = tagIds;
    }

    await cand.save();
    await cand.populate('tags');

    // Log database change
    await Logger.logDatabaseChange('UPDATE', 'AiCand', cand._id.toString(), oldData, { text: cand.text, tags: cand.tags }, userId, req.session.user.username, {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });

    res.json({ success: true, cand });
});

exports.deleteAdminCand = asyncHandler(async (req, res) => {
    const userId = req.session.user.id || req.session.user._id;
    const candId = req.params.id;

    const cand = await AiCand.findById(candId);
    if (!cand) {
        res.status(404);
        throw new Error('Canned response not found');
    }

    // Only Admin can delete admin cands
    if (req.session.user.role !== 'admin') {
        res.status(403);
        throw new Error('Admin privileges required to delete this canned response');
    }

    await AiCand.findByIdAndDelete(candId);

    // Log database change
    await Logger.logDatabaseChange('DELETE', 'AiCand', candId, { text: cand.text }, null, userId, req.session.user.username, {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });

    res.json({ success: true, message: 'Canned response deleted successfully' });
});

exports.reorderAdminCands = asyncHandler(async (req, res) => {
    const userId = req.session.user.id || req.session.user._id;
    const { orderedIds } = req.body; // Array of AiCand IDs in the desired order

    if (!orderedIds || !Array.isArray(orderedIds)) {
        res.status(400);
        throw new Error('orderedIds array is required');
    }

    // Update userOrders for each ID
    for (let i = 0; i < orderedIds.length; i++) {
        const candId = orderedIds[i];
        
        // Find if user already has an order defined in this document
        const cand = await AiCand.findById(candId);
        if (cand) {
            const userOrderIndex = cand.userOrders.findIndex(uo => uo.user.toString() === userId.toString());
            if (userOrderIndex > -1) {
                cand.userOrders[userOrderIndex].order = i;
            } else {
                cand.userOrders.push({ user: userId, order: i });
            }
            await cand.save();
        }
    }

    res.json({ success: true, message: 'Sequence updated successfully' });
});

// GENERATE AI CAND
exports.generateResponse = asyncHandler(async (req, res) => {
    const lob = req.params.lob || 'zomato';
    const { tagIds, extraContext } = req.body;

    // Fetch tags
    const tags = await Tag.find({ _id: { $in: tagIds || [] } });
    const tagNames = tags.map(t => t.name).join(', ');

    // Get prompt template
    let promptObj = await Prompt.findOne({ lob });
    let template = promptObj ? promptObj.template : '';

    if (!template) {
        template = `Generate a WISMO update using tags: {{selectedTags}} and context: {{extraContext}}. Strictly under 190 characters, helpful tone, no pronouns.`;
    }

    // Replace placeholders
    const finalPrompt = template
        .replace('{{selectedTags}}', tagNames || 'None')
        .replace('{{extraContext}}', extraContext || 'None');

    try {
        const text = await generateAiCannedResponse(null, finalPrompt);
        res.json({ success: true, text });
    } catch (err) {
        res.status(500);
        throw new Error('AI Generation failed: ' + err.message);
    }
});
