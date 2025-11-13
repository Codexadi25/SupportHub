const mongoose = require('mongoose');

const privateNoteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    tags: { type: [String], default: [] },
    category: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    visibility: { type: String, enum: ['private', 'public'], default: 'private' } // Added visibility field
}, { timestamps: true });

module.exports = mongoose.model('PrivateNote', privateNoteSchema);