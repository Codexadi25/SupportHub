const PrivateNote = require('../models/PrivateNote');
const Logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');

exports.getNotes = asyncHandler(async (req, res) => {
    const rawUserId = req.session.user._id || req.session.user.id;
    const userId = String(rawUserId);
    const notes = await PrivateNote.find({ user: userId });
    res.json(notes);
});

exports.createNote = asyncHandler(async (req, res) => {
    const { title, content, category } = req.body;
    const rawUserId = req.session.user._id || req.session.user.id;
    const userId = String(rawUserId);
    const safeCategory = (category && String(category).trim()) || 'General';
    const note = await PrivateNote.create({
        title,
        content,
        category: safeCategory,
        user: userId
    });
    
    // Log database change
    await Logger.logDatabaseChange('CREATE', 'PrivateNote', note._id.toString(), null, { title, content, category }, userId, req.session.user.username, {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });
    
    res.status(201).json(note);
});

exports.updateNote = asyncHandler(async (req, res) => {
    const note = await PrivateNote.findById(req.params.id);
    const rawUserId = req.session.user._id || req.session.user.id;
    const userId = String(rawUserId);

    if (note && String(note.user) === userId) {
        const oldData = { title: note.title, content: note.content, category: note.category };
        if (typeof req.body.title === 'string') note.title = req.body.title;
        if (typeof req.body.content === 'string') note.content = req.body.content;
        if (typeof req.body.category === 'string' && req.body.category.trim().length > 0) {
            note.category = req.body.category.trim();
        }
        const updatedNote = await note.save();
        
        // Log database change
        await Logger.logDatabaseChange('UPDATE', 'PrivateNote', note._id.toString(), oldData, { title: note.title, content: note.content, category: note.category }, userId, req.session.user.username, {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        });
        
        res.json(updatedNote);
    } else {
        res.status(404);
        throw new Error('Note not found or user not authorized');
    }
});

exports.deleteNote = asyncHandler(async (req, res) => {
    const note = await PrivateNote.findById(req.params.id);
    const rawUserId = req.session.user._id || req.session.user.id;
    const userId = String(rawUserId);

    if (note && String(note.user) === userId) {
        const oldData = { title: note.title, content: note.content, category: note.category };
        await note.deleteOne();
        
        // Log database change
        await Logger.logDatabaseChange('DELETE', 'PrivateNote', req.params.id, oldData, null, userId, req.session.user.username, {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        });
        
        res.json({ message: 'Note removed' });
    } else {
        res.status(404);
        throw new Error('Note not found or user not authorized');
    }
});