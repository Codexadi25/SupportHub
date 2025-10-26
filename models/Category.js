const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    tags: { type: [String], default: [] },
    text: { type: String, required: true },
    meta: {
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
    }
});

const categorySchema = new mongoose.Schema({
    title: { type: String, required: true, unique: true },
    templates: [templateSchema]
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);