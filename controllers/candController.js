const Category = require('../models/Category');
const { broadcastUpdate } = require('../utils/webSocketServer');
const { generateTags } = require('../utils/autoTagGenerator');
const Logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');

// CATEGORY CONTROLLERS //
exports.createCategory = asyncHandler(async (req, res) => {
    const { title } = req.body;
    const normalizedTitle = title?.trim();

    if (!normalizedTitle) {
        res.status(400);
        throw new Error('Category title is required');
    }

    const existingCategory = await Category.findOne({ title: normalizedTitle, lob: req.params.lob });
    if (existingCategory) {
        res.status(409);
        throw new Error('A category with this title already exists');
    }

    const category = await Category.create({ title: normalizedTitle, lob: req.params.lob });
    
    // Log database change
    await Logger.logDatabaseChange('CREATE', 'Category', category._id.toString(), null, { title: normalizedTitle }, req.session.user.id, req.session.user.username, {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });
    
    broadcastUpdate({ message: 'A new category was created.' });
    res.status(201).json(category);
});

exports.updateCategory = asyncHandler(async (req, res) => {
    const oldCategory = await Category.findOne({ _id: req.params.id, lob: req.params.lob });
    if (!oldCategory) {
        res.status(404);
        throw new Error('Category not found');
    }
    const category = await Category.findOneAndUpdate(
        { _id: req.params.id, lob: req.params.lob },
        { title: req.body.title },
        { new: true }
    );
    
    // Log database change
    await Logger.logDatabaseChange('UPDATE', 'Category', category._id.toString(), { title: oldCategory.title }, { title: category.title }, req.session.user.id, req.session.user.username, {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });
    
    broadcastUpdate({ message: `Category "${category.title}" was updated.` });
    res.json(category);
});

exports.deleteCategory = asyncHandler(async (req, res) => {
    const oldCategory = await Category.findOne({ _id: req.params.id, lob: req.params.lob });
    if (!oldCategory) {
        res.status(404);
        throw new Error('Category not found');
    }
    await Category.findOneAndDelete({ _id: req.params.id, lob: req.params.lob });
    
    // Log database change
    await Logger.logDatabaseChange('DELETE', 'Category', req.params.id, { title: oldCategory.title }, null, req.session.user.id, req.session.user.username, {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });
    
    broadcastUpdate({ message: 'A category was deleted.' });
    res.json({ message: 'Category deleted' });
});


// TEMPLATE CONTROLLERS //
exports.addTemplate = asyncHandler(async (req, res) => {
    const { text, tags } = req.body;
    const category = await Category.findOne({ _id: req.params.categoryId, lob: req.params.lob });
    
    if (category) {
        const autoTags = await generateTags(text);
        const finalTags = [...new Set([...(tags || []), ...autoTags])];
        const now = new Date();

        category.templates.push({ 
            text, 
            tags: finalTags,
            meta: {
                createdAt: now,
                updatedAt: now
            }
        });
        await category.save();
        
        // Log database change
        const newTemplate = category.templates[category.templates.length - 1];
        await Logger.logDatabaseChange('CREATE', 'Template', newTemplate._id.toString(), null, { text, tags: finalTags }, req.session.user.id, req.session.user.username, {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            resourceId: category._id.toString()
        });
        
        broadcastUpdate({ message: 'A new template was added.' });
        res.status(201).json(category);
    } else {
        res.status(404);
        throw new Error('Category not found');
    }
});

exports.updateTemplate = asyncHandler(async (req, res) => {
    const category = await Category.findOne({ _id: req.params.categoryId, lob: req.params.lob });
    if (category) {
        const template = category.templates.id(req.params.templateId);
        const oldData = { text: template.text, tags: template.tags };
        template.text = req.body.text;
        template.tags = req.body.tags;
        
        // Update meta field if it exists, otherwise create it
        if (template.meta) {
            template.meta.updatedAt = new Date();
        } else {
            template.meta = {
                createdAt: template.parent().createdAt || new Date(),
                updatedAt: new Date()
            };
        }
        
        await category.save();
        
        // Log database change
        await Logger.logDatabaseChange('UPDATE', 'Template', req.params.templateId, oldData, { text: template.text, tags: template.tags }, req.session.user.id, req.session.user.username, {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            resourceId: category._id.toString()
        });
        
        broadcastUpdate({ message: 'A template was updated.' });
        res.json(template);
    } else {
        res.status(404);
        throw new Error('Category or template not found');
    }
});

exports.deleteTemplate = asyncHandler(async (req, res) => {
    const category = await Category.findOne({ _id: req.params.categoryId, lob: req.params.lob });
    if (category) {
        const template = category.templates.id(req.params.templateId);
        const oldData = { text: template.text, tags: template.tags };
        category.templates.id(req.params.templateId).deleteOne();
        await category.save();
        
        // Log database change
        await Logger.logDatabaseChange('DELETE', 'Template', req.params.templateId, oldData, null, req.session.user.id, req.session.user.username, {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            resourceId: category._id.toString()
        });
        
        broadcastUpdate({ message: 'A template was deleted.' });
        res.json({ message: 'Template removed' });
    } else {
        res.status(404);
        throw new Error('Category not found');
    }
});

// AI GENERATION CONTROLLER //
exports.generateAiTemplate = asyncHandler(async (req, res) => {
    const { tags, categoryId } = req.body;
    
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
        res.status(400);
        throw new Error('Tags are required to generate AI canned response');
    }

    const lob = req.params.lob || 'zomato';
    const scenario = tags.join(', ');

    // 1. Generate response text using OpenAI or Gemini
    const { generateAiCannedResponse } = require('../services/aiService');
    let text;
    try {
        text = await generateAiCannedResponse(scenario);
    } catch (err) {
        res.status(400);
        throw err;
    }

    // 2. Check user role privilege level
    const userRole = req.session?.user?.role || req.user?.role;
    const isEditorOrAbove = ['editor', 'team_lead', 'quality_analyst', 'vendor', 'admin'].includes(userRole);
    const finalTags = [...new Set([...tags, 'AI'])];

    if (!isEditorOrAbove) {
        return res.status(200).json({
            success: true,
            saved: false,
            text,
            tags: finalTags
        });
    }

    // 3. Find or create Category for authorized users
    let category;
    if (categoryId && categoryId !== 'all') {
        category = await Category.findOne({ _id: categoryId, lob });
    }
    
    if (!category) {
        // Fallback to "AI Generated" category
        category = await Category.findOne({ title: 'AI Generated', lob });
        if (!category) {
            category = await Category.create({ title: 'AI Generated', lob });
        }
    }

    // 4. Save new template
    const now = new Date();
    category.templates.push({
        text,
        tags: finalTags,
        isAi: true,
        meta: {
            createdAt: now,
            updatedAt: now
        }
    });

    await category.save();

    // Log database change
    const newTemplate = category.templates[category.templates.length - 1];
    await Logger.logDatabaseChange('CREATE', 'Template', newTemplate._id.toString(), null, { text, tags: finalTags }, req.session.user.id, req.session.user.username, {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        resourceId: category._id.toString()
    });

    broadcastUpdate({ message: 'A new template was generated using AI.' });

    res.status(201).json({
        success: true,
        saved: true,
        template: newTemplate,
        categoryTitle: category.title,
        categoryId: category._id
    });
});

// AI REPHRASE CONTROLLER //
exports.rephraseAiTemplate = asyncHandler(async (req, res) => {
    const { text } = req.body;
    
    if (!text) {
        res.status(400);
        throw new Error('Text is required to rephrase');
    }

    const { rephraseAiCannedResponse } = require('../services/aiService');
    let rephrasedText;
    try {
        rephrasedText = await rephraseAiCannedResponse(text);
    } catch (err) {
        res.status(400);
        throw err;
    }

    res.json({
        success: true,
        text: rephrasedText
    });
});
