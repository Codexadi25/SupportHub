const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Sop, Audit, Theme } = require('../models/Sop');
const sopController = require('../controllers/sopController');
const { generateSopDraft } = require('../services/aiService');

// Multer setup for processing PDF, DOCX, Images, etc.
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to check role authorization (supports session or req.user)
// ROLE MAP: 'Admin' -> 'admin', 'QA' -> 'quality_analyst', 'TL' -> 'team_lead', etc.
const ROLE_ALIASES = {
  'Admin': 'admin', 'QA': 'quality_analyst', 'TL': 'team_lead',
  'Editor': 'editor', 'Vendor': 'vendor', 'New': 'new',
  // Already-correct slugs pass through
  'admin': 'admin', 'quality_analyst': 'quality_analyst', 'team_lead': 'team_lead',
  'editor': 'editor', 'vendor': 'vendor', 'new': 'new'
};

const checkRole = (roles) => (req, res, next) => {
  const rawRole = req.session?.user?.role || req.user?.role;
  if (!rawRole) return res.status(401).json({ error: 'Authentication required' });
  // Normalize: accept both display names and slug values
  const normalizedRoles = roles.map(r => ROLE_ALIASES[r] || r.toLowerCase());
  const normalizedUser  = ROLE_ALIASES[rawRole] || rawRole.toLowerCase();
  if (!normalizedRoles.includes(normalizedUser)) {
    return res.status(403).json({ error: `Unauthorized access. Required: ${roles.join(', ')}` });
  }
  next();
};

// Normalize LOB param so downstream handlers always have a value
router.use((req, res, next) => {
  try {
    // ensure req.params exists (defensive)
    if (!req.params) req.params = {};
    if (!req.params.lob) {
      req.params.lob = req.body?.lob || req.query?.lob || req.user?.lob || 'zomato';
    } else {
      // coerce to string to avoid weird param processing errors
      req.params.lob = String(req.params.lob);
    }
    next();
  } catch (err) {
    next(err);
  }
});

// 1. GET Published SOP (For Agents)
// GET Published SOP (For Agents) with optional search & pagination
router.get('/view', async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.body?.lob || req?.query?.lob || req?.session?.user?.lob || 'zomato';
    const theme = await Theme.findOne({ lob }) || {};

    // search & pagination
    const q = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.max(6, Math.min(50, parseInt(req.query.perPage, 10) || 12));

    const filter = { lob, status: 'Published' };
    if (q) {
      const r = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: r },
        { condition: r },
        { tags: r }
      ];
    }

    const total = await Sop.countDocuments(filter);
    const sops = await Sop.find(filter).sort({ 'lastUpdated.at': -1 }).skip((page - 1) * perPage).limit(perPage);

    // Group by category for the panel UI
    const categoriesMap = {};
    sops.forEach(s => {
      const cat = s.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(s);
    });

    const categories = Object.keys(categoriesMap).map(title => ({ title, items: categoriesMap[title] }));
    const allTags = Array.from(new Set((await Sop.find({ lob })).flatMap(s => s.tags || [])));

    res.render('sop_panel', { categories, allTags, theme, user: req.session?.user || req.user, mode: 'view', lob, pagination: { page, perPage, total } });
  } catch (error) {
    console.error("Error fetching SOPs:", error);
    res.status(500).json({ error: "Failed to fetch SOPs" });
  }
});

// 2. POST AI Auto-Draft
router.post('/ai-draft', checkRole(['QA', 'Admin', 'TL']), upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Determine LOB: prefer mounted param, fall back to body
    const lob = req?.params?.lob || req?.body?.lob || req?.query?.lob || req?.user?.lob;
    if (!lob) {
      return res.status(400).json({ error: "LOB (Line of Business) is required" });
    }

    // Process the file and generate SOP draft
    const draftData = await generateSopDraft(req.file.buffer, req.file.mimetype);

    // Save as Draft with tracking
    const newSop = await Sop.create({
      ...draftData,
      lob,
      status: 'Draft',
      lastUpdated: {
        at: new Date(),
        by: req.user?.username || 'system',
        role: req.user?.role || 'system'
      }
    });

    res.json({ success: true, message: "Draft created via AI", data: newSop });
  } catch (error) {
    console.error("AI Processing Error:", error);
    res.status(500).json({ error: "Failed to process SOP draft" });
  }
});

// 4. Create new SOP block (from modal)
router.post('/create-block', checkRole(['Admin']), async (req, res, next) => {
  try {
    // controller expects lob in body (modal includes hidden lob)
    await sopController.createBlock(req, res, next);
  } catch (err) {
    next(err);
  }
});

// 5. GET Drafts for a LOB (Admin/QA view)
router.get('/drafts', checkRole(['Admin','QA','TL','Editor']), async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.query?.lob || req?.body?.lob || req?.session?.user?.lob;
    const theme = await Theme.findOne({ lob }) || {};

    const q = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.max(6, Math.min(50, parseInt(req.query.perPage, 10) || 12));

    const filter = { lob, status: 'Draft' };
    if (q) {
      const r = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [ { title: r }, { condition: r }, { tags: r } ];
    }

    const total = await Sop.countDocuments(filter);
    const sops = await Sop.find(filter).sort({ 'lastUpdated.at': -1 }).skip((page - 1) * perPage).limit(perPage);

    const categoriesMap = {};
    sops.forEach(s => {
      const cat = s.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(s);
    });

    const categories = Object.keys(categoriesMap).map(title => ({ title, items: categoriesMap[title] }));
    const allTags = Array.from(new Set((await Sop.find({ lob })).flatMap(s => s.tags || [])));

    res.render('sop_panel', { categories, allTags, theme, user: req.session?.user || req.user, mode: 'draft', lob, pagination: { page, perPage, total } });
  } catch (err) {
    console.error('Error loading drafts:', err);
    res.status(500).send('Failed to load drafts');
  }
});

// 7. UPDATE a SOP block (Admin + Quality Analyst)
router.put('/update/:id', checkRole(['Admin', 'quality_analyst']), async (req, res) => {
  try {
    const { category, title, condition, action, tags, status } = req.body;
    const user = req.session?.user || req.user;

    const sop = await Sop.findById(req.params.id);
    if (!sop) return res.status(404).json({ error: 'SOP not found' });

    if (category  !== undefined) sop.category  = category;
    if (title     !== undefined) sop.title     = title;
    if (condition !== undefined) sop.condition = condition;
    if (action    !== undefined) sop.action    = action;
    if (tags      !== undefined) sop.tags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : (tags || []);
    if (status    !== undefined && ['Published', 'Draft', 'Archived'].includes(status)) sop.status = status;

    sop.lastUpdated = { at: new Date(), by: user?.username || 'unknown', role: user?.role || 'unknown' };
    await sop.save();

    await Audit.create({
      sopId: sop._id,
      action: 'Updated',
      details: `Updated by ${user?.username || 'unknown'} (${user?.role || ''})`,
      user: user?.username || 'system'
    });

    res.json({ success: true, data: sop });
  } catch (err) {
    console.error('SOP update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. DELETE a SOP block (Admin only)
router.delete('/delete/:id', checkRole(['Admin']), async (req, res) => {
  try {
    const user = req.session?.user || req.user;
    const sop = await Sop.findByIdAndDelete(req.params.id);
    if (!sop) return res.status(404).json({ error: 'SOP not found' });

    await Audit.create({
      sopId: req.params.id,
      action: 'Deleted',
      details: `Deleted by ${user?.username || 'unknown'}`,
      user: user?.username || 'system'
    });

    res.json({ success: true, message: 'SOP deleted' });
  } catch (err) {
    console.error('SOP delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Approval endpoint
router.post('/approve/:id', checkRole(['Admin']), async (req, res, next) => {
  try {
    await sopController.approveDraft(req, res, next);
  } catch (err) {
    next(err);
  }
});

// 3. ADMIN: Manage Colors
router.post('/theme', checkRole(['Admin']), async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.body?.lob || req?.query?.lob || req?.user?.lob;
    const { primary, secondary } = req.body;

    if (!primary || !secondary) {
      return res.status(400).json({ error: "Primary and secondary colors are required" });
    }

    await Theme.findOneAndUpdate(
      { lob },
      { primaryColor: primary, secondaryColor: secondary },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Theme updated successfully" });
  } catch (error) {
    console.error("Theme update error:", error);
    res.status(500).json({ error: "Failed to update theme" });
  }
});

// Admin settings UI
router.get('/admin-settings', checkRole(['Admin']), async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.body?.lob || req?.query?.lob || req?.user?.lob;
    const theme = await Theme.findOne({ lob }) || {};
    res.render('sop_admin_settings', { lob, theme, user: req.user });
  } catch (err) {
    console.error('Error loading admin settings:', err);
    res.status(500).send('Failed to load admin settings');
  }
});

// ─── SOP EDIT ROUTE — Admin / Quality Analyst only ─────────────────────────
// Accessible via /:lob/sop/edit  (e.g. /zomato/wimo-AI-Handover/sop/edit)
// The /:lob segment is captured by the app.use('/:lob/sop', sopRoutes) mount.
const { isAuthenticated } = require('../middleware/authMiddleware');

router.get('/edit', isAuthenticated, checkRole(['Admin', 'quality_analyst']), async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.session?.user?.lob || 'zomato';
    const theme = await Theme.findOne({ lob }) || {};

    // Fetch ALL SOPs for this lob (all statuses) so editor sees everything
    const sops = await Sop.find({ lob }).sort({ category: 1, 'lastUpdated.at': -1 });

    const categoriesMap = {};
    sops.forEach(s => {
      const cat = s.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(s);
    });
    const categories = Object.keys(categoriesMap).map(title => ({ title, items: categoriesMap[title] }));
    const allTags = Array.from(new Set(sops.flatMap(s => s.tags || [])));

    res.render('sop_panel', {
      categories, allTags, theme,
      user: req.session?.user || req.user,
      mode: 'edit',   // <-- signals template to show edit controls
      lob,
      pagination: { page: 1, perPage: 999, total: sops.length }
    });
  } catch (err) {
    console.error('SOP edit load error:', err);
    res.status(500).send('Failed to load SOP editor');
  }
});

// ─── CREATE SOP CATEGORY (Admin/QA) ────────────────────────────────────────
router.post('/category', isAuthenticated, checkRole(['Admin', 'quality_analyst']), async (req, res) => {
  try {
    const lob  = req?.params?.lob || req?.session?.user?.lob || 'zomato';
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Category name required' });

    // Create a placeholder block to instantiate the category
    const sop = await Sop.create({
      lob,
      category: name.trim(),
      title: 'New SOP Block',
      condition: 'Describe the scenario trigger',
      action: 'Wait',
      status: 'Draft',
      lastUpdated: {
        at: new Date(),
        by: req.session?.user?.username || 'admin',
        role: req.session?.user?.role   || 'admin'
      }
    });

    res.json({ success: true, data: sop });
  } catch (err) {
    console.error('Category create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── CREATE SOP BLOCK UNDER CATEGORY (Admin/QA) ────────────────────────────
router.post('/block', isAuthenticated, checkRole(['Admin', 'quality_analyst']), async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.session?.user?.lob || 'zomato';
    const { category, title, condition, action, tags, status } = req.body;
    if (!category) return res.status(400).json({ error: 'Category required' });

    const sop = await Sop.create({
      lob, category,
      title:     title     || 'New Block',
      condition: condition || '',
      action:    ['Cancel','Escalate','Wait'].includes(action) ? action : 'Wait',
      tags:      Array.isArray(tags) ? tags : (tags || '').split(',').map(t => t.trim()).filter(Boolean),
      status:    ['Published','Draft','Archived'].includes(status) ? status : 'Draft',
      lastUpdated: {
        at: new Date(),
        by: req.session?.user?.username || 'admin',
        role: req.session?.user?.role   || 'admin'
      }
    });

    res.json({ success: true, data: sop });
  } catch (err) {
    console.error('Block create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── REORDER / PUBLISH LAYOUT (Admin/QA) ───────────────────────────────────
// Body: { order: [ { id: '<sopId>', category: 'New Cat Name' }, ... ] }
// Updates category names for drag-rearranged blocks and publishes them.
router.patch('/reorder', isAuthenticated, checkRole(['Admin', 'quality_analyst']), async (req, res) => {
  try {
    const { order } = req.body; // array of { id, category }
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });

    const user = req.session?.user || req.user;
    const ops  = order.map(({ id, category }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { category, 'lastUpdated.at': new Date(), 'lastUpdated.by': user?.username } }
      }
    }));

    if (ops.length) await Sop.bulkWrite(ops);
    res.json({ success: true, updated: ops.length });
  } catch (err) {
    console.error('Reorder error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;