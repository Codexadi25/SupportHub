const mongoose = require('mongoose');

const AiCandSchema = new mongoose.Schema({
  lob: { type: String, required: true }, // line of business
  text: { type: String, required: true }, // generated cand sentence
  tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }], // associated tags
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // admin creator
  isAdminCreated: { type: Boolean, default: true },
  // user specific ordering stored per user in a sub‑document
  userOrders: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    order: { type: Number, default: 0 }
  }]
}, { timestamps: true });

module.exports = mongoose.model('AiCand', AiCandSchema);
