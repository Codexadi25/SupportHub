const mongoose = require('mongoose');

const privateNoteSchema = new mongoose.Schema({
    title:      { type: String, required: true },
    content:    { type: String, required: true },
    tags:       { type: [String], default: [] },
    category:   { type: String, required: true, default: 'General' },
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy:  { type: String, default: '' }, // username of creator (shown on public notes)
    visibility: { type: String, enum: ['private', 'public'], default: 'private' },
    lob:        { type: String, default: 'zomato', lowercase: true, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('PrivateNote', privateNoteSchema);