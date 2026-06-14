const mongoose = require('mongoose');

const PromptSchema = new mongoose.Schema({
  lob: { type: String, required: true, unique: true },
  template: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Prompt', PromptSchema);
