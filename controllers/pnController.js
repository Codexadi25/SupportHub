const PrivateNote = require('../models/PrivateNote');
const Logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');

exports.getNotes = asyncHandler(async (req, res) => {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        let notes;
        if (sessionUser.role === 'new') {
            notes = await PrivateNote.find({ user: sessionUser.id });
        } else {
            // Adjust as needed for other roles/visibility rules
            notes = await PrivateNote.find();
        }

        res.status(200).json(notes);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching notes', error: error.message || error });
            }
});

exports.createNote = asyncHandler(async (req, res) => {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { title, content, category } = req.body;
    let { tags, visibility } = req.body;

    if (!title || typeof title !== 'string' || !content || typeof content !== 'string') {
        return res.status(400).json({ message: 'Title and content are required and must be strings' });
    }

    // Normalize tags to array of trimmed strings
    if (!Array.isArray(tags)) {
        if (typeof tags === 'string') {
            tags = tags.split(',').map(t => t.trim()).filter(Boolean);
        } else {
            tags = [];
        }
    } else {
        tags = tags.map(t => String(t).trim()).filter(Boolean);
    }

    // Normalize visibility
    visibility = String(visibility || 'private').toLowerCase();
    if (!['private', 'public'].includes(visibility)) visibility = 'private';

    const safeCategory = (category && String(category).trim()) || 'General';

    const note = await PrivateNote.create({
        title: title.trim(),
        content: content,
        tags,
        category: safeCategory,
        user: sessionUser.id,
        visibility
    });

    // Log database change
    await Logger.logDatabaseChange('CREATE', 'PrivateNote', note._id.toString(), null, { title: note.title, content: note.content, tags, category: safeCategory, visibility }, sessionUser.id, sessionUser.username, {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });

    res.status(201).json(note);
});

exports.updateNote = asyncHandler(async (req, res) => {
    const note = await PrivateNote.findById(req.params.id);
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (note && String(note.user) === sessionUser.id) {
        const oldData = { title: note.title, content: note.content, category: note.category, tags: note.tags, visibility: note.visibility };

        if (typeof req.body.title === 'string' && req.body.title.trim().length > 0) {
            note.title = req.body.title.trim();
        }
        if (typeof req.body.content === 'string') note.content = req.body.content;
        if (typeof req.body.category === 'string' && req.body.category.trim().length > 0) {
            note.category = req.body.category.trim();
        }

        // Update tags if provided
        if (typeof req.body.tags !== 'undefined') {
            let newTags = req.body.tags;
            if (!Array.isArray(newTags)) {
                if (typeof newTags === 'string') {
                    newTags = newTags.split(',').map(t => t.trim()).filter(Boolean);
                } else {
                    newTags = [];
                }
            } else {
                newTags = newTags.map(t => String(t).trim()).filter(Boolean);
            }
            note.tags = newTags;
        }

        // Update visibility if provided
        if (typeof req.body.visibility !== 'undefined') {
            let vis = String(req.body.visibility || 'private').toLowerCase();
            if (!['private', 'public'].includes(vis)) vis = 'private';
            note.visibility = vis;
        }

        const updatedNote = await note.save();

        // Log database change
        await Logger.logDatabaseChange('UPDATE', 'PrivateNote', note._id.toString(), oldData, { title: updatedNote.title, content: updatedNote.content, category: updatedNote.category, tags: updatedNote.tags, visibility: updatedNote.visibility }, sessionUser.id, sessionUser.username, {
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
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (note && String(note.user) === sessionUser.id) {
        const oldData = { title: note.title, content: note.content, category: note.category, tags: note.tags, visibility: note.visibility };
        await note.deleteOne();

        // Log database change
        await Logger.logDatabaseChange('DELETE', 'PrivateNote', req.params.id, oldData, null, sessionUser.id, sessionUser.username, {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        });

        res.json({ message: 'Note removed' });
    } else {
        res.status(404);
        throw new Error('Note not found or user not authorized');
            }
});