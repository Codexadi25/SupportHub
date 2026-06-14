const mongoose = require('mongoose');

// Tag schema for tracking frequency and associations
const tagSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    frequency: { type: Number, default: 0 },  // Count of how often the tag has been used
    associatedWith: { type: [String], default: [] }, // List of tags that are commonly used together
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Tag', tagSchema);