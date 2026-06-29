const mongoose = require('mongoose');

/**
 * Department Model
 * ─────────────────────────────────────────────────────────────────────────────
 * A "department" scopes all SupportHub resources:
 *   Canned Responses, Private Notes, SOPs, Feedbacks, Messages, Notices
 *
 * Every resource model should carry a `department` field referencing this ID.
 * Users are assigned to exactly one department (stored in their User doc).
 *
 * URL pattern:  /:deptSlug/sop/view    /:deptSlug/sop/edit
 * Examples:     /zomato/sop/view       /wimo-ai-handover/sop/edit
 * ─────────────────────────────────────────────────────────────────────────────
 */
const departmentSchema = new mongoose.Schema({
  // Human-readable name shown in the UI
  name: {
    type: String,
    required: true,
    trim: true
  },

  // URL-safe slug — used in /:lob/ route segments (replaces the old "lob" field)
  // e.g. "zomato", "wimo-ai-handover", "blinkit-ops"
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9-]+$/
  },

  // Short description for the admin department list
  description: { type: String, default: '' },

  // Theme colours (previously on Theme model — consolidated here)
  theme: {
    primaryColor:   { type: String, default: '#2563eb' },
    secondaryColor: { type: String, default: '#0f172a' },
    accentColor:    { type: String, default: '#7c3aed' }
  },

  // The vendor/admin who owns / created this department
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now }
});

// Virtual: full edit URL for a given request hostname
departmentSchema.virtual('editUrl').get(function () {
  return `/sop/${this.slug}/edit`; // Notice that if LOB routing is needed this might need adaptation, but keeping as requested
});
departmentSchema.virtual('viewUrl').get(function () {
  return `/sop/${this.slug}/view`;
});

module.exports = mongoose.model('Department', departmentSchema);
