const PrivateNote = require('../models/PrivateNote');
const Logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');
const { broadcastUpdate } = require('../utils/webSocketServer');

// Helper to safely read the session user
const getSessionUser = (req) => req.session?.user || req.user || null;

// ROLES that can see all notes (public + private from everyone)
const ELEVATED_ROLES = ['admin', 'vendor', 'team_lead', 'quality_analyst', 'editor'];

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/pns  — fetch notes visible to the current user
// ──────────────────────────────────────────────────────────────────────────────
exports.getNotes = asyncHandler(async (req, res) => {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return res.status(401).json({ message: 'Unauthorized' });

    let notes;

    if (ELEVATED_ROLES.includes(sessionUser.role)) {
        // Elevated users see: all public notes + their own private notes + all notes they created
        notes = await PrivateNote.find({
            lob: req.params.lob,
            $or: [
                { visibility: 'public' },
                { user: sessionUser.id }
            ]
        }).sort({ createdAt: -1 });
    } else if (sessionUser.role === 'new') {
        // Restricted users — only their own notes
        notes = await PrivateNote.find({ user: sessionUser.id, lob: req.params.lob }).sort({ createdAt: -1 });
    } else {
        // Regular users — own notes + public notes
        notes = await PrivateNote.find({
            lob: req.params.lob,
            $or: [
                { visibility: 'public' },
                { user: sessionUser.id }
            ]
        }).sort({ createdAt: -1 });
    }

    res.status(200).json(notes);
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/pns  — create a new note
// ──────────────────────────────────────────────────────────────────────────────
exports.createNote = asyncHandler(async (req, res) => {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return res.status(401).json({ message: 'Unauthorized' });

    const { title, content, category } = req.body;
    let { tags, visibility } = req.body;

    if (!title || typeof title !== 'string' || !content || typeof content !== 'string') {
        return res.status(400).json({ message: 'Title and content are required and must be strings' });
    }

    // Normalize tags
    if (!Array.isArray(tags)) {
        tags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    } else {
        tags = tags.map(t => String(t).trim()).filter(Boolean);
    }

    // Normalize visibility — only elevated roles can create public notes
    visibility = String(visibility || 'private').toLowerCase();
    if (!['private', 'public'].includes(visibility)) visibility = 'private';

    // Non-elevated users can only create private notes
    if (!ELEVATED_ROLES.includes(sessionUser.role) && visibility === 'public') {
        visibility = 'private';
    }

    const safeCategory = (category && String(category).trim()) || 'General';

    const note = await PrivateNote.create({
        title: title.trim(),
        content,
        tags,
        category: safeCategory,
        user: sessionUser.id,
        visibility,
        createdBy: sessionUser.username,
        lob: req.params.lob
    });

    await Logger.logDatabaseChange('CREATE', 'PrivateNote', note._id.toString(), null,
        { title: note.title, visibility, category: safeCategory },
        sessionUser.id, sessionUser.username,
        { ip: req.ip || req.connection.remoteAddress, userAgent: req.get('User-Agent') }
    );

    broadcastUpdate({ message: `New public note "${note.title}" was added.`, type: 'pn_created' });
    res.status(201).json(note);
});

// ──────────────────────────────────────────────────────────────────────────────
// PUT /api/pns/:id  — update a note (owner OR admin/vendor)
// ──────────────────────────────────────────────────────────────────────────────
exports.updateNote = asyncHandler(async (req, res) => {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return res.status(401).json({ message: 'Unauthorized' });

    const note = await PrivateNote.findOne({ _id: req.params.id, lob: req.params.lob });
    if (!note) {
        res.status(404);
        throw new Error('Note not found');
    }

    const isOwner   = String(note.user) === String(sessionUser.id);
    const isManager = ['admin', 'vendor'].includes(sessionUser.role);

    if (!isOwner && !isManager) {
        res.status(403);
        throw new Error('Not authorized to edit this note');
    }

    const oldData = { title: note.title, content: note.content, category: note.category, tags: note.tags, visibility: note.visibility };

    if (typeof req.body.title   === 'string' && req.body.title.trim()) note.title = req.body.title.trim();
    if (typeof req.body.content === 'string') note.content = req.body.content;
    if (typeof req.body.category === 'string' && req.body.category.trim()) note.category = req.body.category.trim();

    if (typeof req.body.tags !== 'undefined') {
        let newTags = req.body.tags;
        if (!Array.isArray(newTags)) {
            newTags = typeof newTags === 'string' ? newTags.split(',').map(t => t.trim()).filter(Boolean) : [];
        } else {
            newTags = newTags.map(t => String(t).trim()).filter(Boolean);
        }
        note.tags = newTags;
    }

    if (typeof req.body.visibility !== 'undefined') {
        let vis = String(req.body.visibility || 'private').toLowerCase();
        if (!['private', 'public'].includes(vis)) vis = 'private';
        // Only elevated roles can change visibility to public
        if (vis === 'public' && !ELEVATED_ROLES.includes(sessionUser.role)) vis = 'private';
        note.visibility = vis;
    }

    const updatedNote = await note.save();

    await Logger.logDatabaseChange('UPDATE', 'PrivateNote', note._id.toString(), oldData,
        { title: updatedNote.title, content: updatedNote.content, visibility: updatedNote.visibility },
        sessionUser.id, sessionUser.username,
        { ip: req.ip || req.connection.remoteAddress, userAgent: req.get('User-Agent') }
    );

    if (updatedNote.visibility === 'public') {
        broadcastUpdate({ message: `Public note "${updatedNote.title}" was updated.`, type: 'pn_updated' });
    }

    res.json(updatedNote);
});

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/pns/:id  — delete a note (owner OR admin/vendor)
// ──────────────────────────────────────────────────────────────────────────────
exports.deleteNote = asyncHandler(async (req, res) => {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return res.status(401).json({ message: 'Unauthorized' });

    const note = await PrivateNote.findOne({ _id: req.params.id, lob: req.params.lob });
    if (!note) {
        res.status(404);
        throw new Error('Note not found');
    }

    const isOwner   = String(note.user) === String(sessionUser.id);
    const isManager = ['admin', 'vendor'].includes(sessionUser.role);

    if (!isOwner && !isManager) {
        res.status(403);
        throw new Error('Not authorized to delete this note');
    }

    const oldData = { title: note.title, visibility: note.visibility };
    await note.deleteOne();

    await Logger.logDatabaseChange('DELETE', 'PrivateNote', req.params.id, oldData, null,
        sessionUser.id, sessionUser.username,
        { ip: req.ip || req.connection.remoteAddress, userAgent: req.get('User-Agent') }
    );

    res.json({ message: 'Note removed' });
});