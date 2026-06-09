const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    tags: { type: [String], default: [] },
    text: { type: String, required: true },
    isAi: { type: Boolean, default: false },
    meta: {
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
    }
});

const categorySchema = new mongoose.Schema({
    title: { type: String, required: true },
    lob: { type: String, default: 'zomato', lowercase: true, trim: true },
    templates: [templateSchema]
}, { timestamps: true });

categorySchema.index({ title: 1, lob: 1 }, { unique: true });

module.exports = mongoose.model('Category', categorySchema);