const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const { Sop, Audit, Theme, SopTemplate, SopDraft, SopHistory } = require('../models/Sop');
const Notification = require('../models/Notification');
const sopController = require('../controllers/sopController');
const { generateSopDraft } = require('../services/aiService');
const { isAuthenticated, isNotNew } = require('../middleware/authMiddleware');
const Logger = require('../utils/logger');

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

const checkSopPermission = (req, res, next) => {
  const user = req.session?.user || req.user;
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  
  const rawRole = user.role;
  const normalizedRole = ROLE_ALIASES[rawRole] || rawRole.toLowerCase();
  
  const allowedRoles = ['admin', 'quality_analyst', 'team_lead'];
  if (!allowedRoles.includes(normalizedRole)) {
    return res.status(403).json({ error: 'Forbidden: Only Admins, Team Leaders, and Quality Analysts can modify SOPs.' });
  }

  // If not admin, the user must belong to the department of the LOB
  if (normalizedRole !== 'admin') {
    const lob = (req.params.lob || req.body.lob || req.query.lob || 'zomato').toLowerCase().trim();
    const userDept = (user.department || 'general').toLowerCase().trim();
    if (userDept !== lob) {
      return res.status(403).json({ error: `Forbidden: You are not authorized to modify SOPs for the "${lob}" department.` });
    }
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

// 1. GET Published SOP — requires authentication, 'new' role is blocked
router.get('/view', isAuthenticated, isNotNew, async (req, res) => {
  try {
    const lob = (req.params.lob || req.body.lob || req.query.lob || req.session?.user?.lob || 'zomato').toLowerCase().trim();
    const user = req.session?.user || req.user;
    const userDept = (user?.department || 'general').toLowerCase().trim();
    const rawRole = user?.role || '';
    const normalizedRole = ROLE_ALIASES[rawRole] || rawRole.toLowerCase();

    // Authorization check: only respective LOB users can access that SOP
    if (normalizedRole !== 'admin') {
      if (userDept !== lob) {
        return res.status(403).send(`Forbidden: SOP for "${lob}" is restricted to "${lob}" department/LOB users only.`);
      }
    }

    // Render the beautiful interactive panel for authorized users
    const viewTemplate = 'sop_panel';

    const theme = await Theme.findOne({ lob }) || {};
    const template = await SopTemplate.findOne({ lob }) || { sidebarConfig: {}, categories: [] };

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
    const sops = await Sop.find(filter).sort({ order: 1 }).skip((page - 1) * perPage).limit(perPage);

    // Group by category for the panel UI
    const categoriesMap = {};
    sops.forEach(s => {
      const cat = s.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(s);
    });

    const tempCats = template.categories || [];
    const categories = Object.keys(categoriesMap).map(title => {
      const config = tempCats.find(c => c.name.toLowerCase().trim() === title.toLowerCase().trim());
      return {
        title,
        items: categoriesMap[title],
        phase: config ? config.phase : '',
        order: config ? config.order : 999
      };
    }).sort((a, b) => a.order - b.order);

    const allTags = Array.from(new Set((await Sop.find({ lob })).flatMap(s => s.tags || [])));

    res.render(viewTemplate, { categories, allTags, theme, template, user: user, mode: 'view', lob, pagination: { page, perPage, total } });
  } catch (error) {
    console.error("Error fetching SOPs:", error);
    res.status(500).json({ error: "Failed to fetch SOPs" });
  }
});

// 2. POST AI Auto-Draft
router.post('/ai-draft', checkSopPermission, upload.single('document'), async (req, res) => {
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
router.post('/create-block', checkSopPermission, async (req, res, next) => {
  try {
    // controller expects lob in body (modal includes hidden lob)
    await sopController.createBlock(req, res, next);
  } catch (err) {
    next(err);
  }
});

// 5. GET Drafts for a LOB (Admin/QA view)
router.get('/drafts', checkSopPermission, async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.query?.lob || req?.body?.lob || req?.session?.user?.lob;
    const user = req.session?.user || req.user;
    const userDept = (user?.department || 'general').toLowerCase().trim();

    // Authorization check: Zomato SOP drafts are strictly for Zomato department users only.
    if (lob && lob.toLowerCase().trim() === 'zomato' && userDept !== 'zomato') {
      return res.status(403).send('Forbidden: Zomato SOP drafts are restricted to Zomato department users only.');
    }

    const theme = await Theme.findOne({ lob }) || {};
    const template = await SopTemplate.findOne({ lob }) || { sidebarConfig: {}, categories: [] };

    const q = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.max(6, Math.min(50, parseInt(req.query.perPage, 10) || 12));

    const filter = { lob, status: 'Draft' };
    if (q) {
      const r = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [ { title: r }, { condition: r }, { tags: r } ];
    }

    const total = await Sop.countDocuments(filter);
    const sops = await Sop.find(filter).sort({ order: 1 }).skip((page - 1) * perPage).limit(perPage);

    const categoriesMap = {};
    sops.forEach(s => {
      const cat = s.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(s);
    });

    const tempCats = template.categories || [];
    const categories = Object.keys(categoriesMap).map(title => {
      const config = tempCats.find(c => c.name.toLowerCase().trim() === title.toLowerCase().trim());
      return {
        title,
        items: categoriesMap[title],
        phase: config ? config.phase : '',
        order: config ? config.order : 999
      };
    }).sort((a, b) => a.order - b.order);

    const allTags = Array.from(new Set((await Sop.find({ lob })).flatMap(s => s.tags || [])));

    res.render('sop_panel', { categories, allTags, theme, template, user: req.session?.user || req.user, mode: 'draft', lob, pagination: { page, perPage, total } });
  } catch (err) {
    console.error('Error loading drafts:', err);
    res.status(500).send('Failed to load drafts');
  }
});

// 7. UPDATE a SOP block (Admin + Quality Analyst)
router.put('/update/:id', checkSopPermission, async (req, res) => {
  try {
    const { category, title, condition, action, tags, status } = req.body;
    const user = req.session?.user || req.user;

    const sop = await Sop.findById(req.params.id);
    if (!sop) return res.status(404).json({ error: 'SOP not found' });

    const wasPublished = sop.status === 'Published';

    if (category  !== undefined) sop.category  = category;
    if (title     !== undefined) sop.title     = title;
    if (condition !== undefined) sop.condition = condition;
    if (action    !== undefined) sop.action    = action;
    if (tags      !== undefined) sop.tags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : (tags || []);
    if (status    !== undefined && ['Published', 'Draft', 'Archived'].includes(status)) sop.status = status;

    sop.lastUpdated = { at: new Date(), by: user?.username || 'unknown', role: user?.role || 'unknown' };
    await sop.save();

    if (sop.status === 'Published' && (!wasPublished || category !== undefined || title !== undefined)) {
      try {
        await Notification.create({
          title: `SOP Updated: ${sop.title}`,
          content: `SOP under category "${sop.category}" was updated/published by ${user?.username || 'unknown'}.`,
          type: 'sop_update',
          recipientDepartment: sop.lob,
          lob: sop.lob
        });
      } catch (notifErr) {
        console.error('[Notification Trigger] Failed to create SOP update notification:', notifErr);
      }
    }

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
router.delete('/delete/:id', checkSopPermission, async (req, res) => {
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
router.post('/approve/:id', checkSopPermission, async (req, res, next) => {
  try {
    await sopController.approveDraft(req, res, next);
  } catch (err) {
    next(err);
  }
});

// 3. ADMIN: Manage Colors
router.post('/theme', checkSopPermission, async (req, res) => {
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
router.get('/admin-settings', checkSopPermission, async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.body?.lob || req?.query?.lob || req?.user?.lob;
    const theme = await Theme.findOne({ lob }) || {};
    res.render('sop_admin_settings', { lob, theme, user: req.user });
  } catch (err) {
    console.error('Error loading admin settings:', err);
    res.status(500).send('Failed to load admin settings');
  }
});

// ─── SOP EDIT ROUTE — Admin / TL / QA only ─────────────────────────
// Accessible via /:lob/sop/edit  (e.g. /zomato/sop/edit)
// The /:lob segment is captured by the app.use('/:lob/sop', sopRoutes) mount.

router.get('/edit', isAuthenticated, async (req, res) => {
  try {
    const user = req.session?.user || req.user;
    const rawRole = user?.role || '';
    const normalizedRole = ROLE_ALIASES[rawRole] || rawRole.toLowerCase();
    const lob = (req.params.lob || req.session?.user?.lob || 'zomato').toLowerCase().trim();
    const userDept = (user?.department || 'general').toLowerCase().trim();

    const allowed = ['admin', 'quality_analyst', 'team_lead'];
    if (!allowed.includes(normalizedRole) || (normalizedRole !== 'admin' && userDept !== lob)) {
      return res.redirect(`/${lob}/sop/view`);
    }

    const theme = await Theme.findOne({ lob }) || {};

    // Load or initialize user's active draft
    let draft = await SopDraft.findOne({ userId: user._id, lob });
    if (!draft) {
      let template = await SopTemplate.findOne({ lob });
      if (!template) {
        template = await SopTemplate.create({
          lob,
          headerImage: '',
          googleSheetUrl: '',
          categories: [],
          sidebarConfig: {
            calculator: true,
            callingScript: '"Thank you for contacting customer support. My name is [Agent Name]. How can I assist you today?"',
            quickPrompts: [
              { label: "General Inquiries", text: "I would be happy to check the details and update you. Please hold on for a moment." },
              { label: "Escalation standard", text: "Let me escalate this matter to our senior support desk to get it resolved quickly." }
            ],
            recentUpdates: [
              { date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-'), text: `Default SOP template initialized for ${lob}.` }
            ]
          }
        });
      }
      const liveCards = await Sop.find({ lob, status: 'Published' }).sort({ order: 1 });
      draft = await SopDraft.create({
        userId: user._id,
        lob,
        template: {
          headerImage: template.headerImage || '',
          googleSheetUrl: template.googleSheetUrl || '',
          sidebarConfig: template.sidebarConfig || {},
          categories: template.categories || []
        },
        cards: liveCards.map(c => c.toObject())
      });
    }

    const categoriesMap = {};
    draft.cards.forEach(s => {
      const cat = s.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(s);
    });

    const tempCats = draft.template.categories || [];
    const categories = Object.keys(categoriesMap).map(title => {
      const config = tempCats.find(c => c.name.toLowerCase().trim() === title.toLowerCase().trim());
      return {
        title,
        items: categoriesMap[title],
        phase: config ? config.phase : '',
        order: config ? config.order : 999
      };
    }).sort((a, b) => a.order - b.order);

    const allTags = Array.from(new Set(draft.cards.flatMap(s => s.tags || [])));

    res.render('sop_panel', {
      categories, allTags, theme,
      template: draft.template,
      user: req.session?.user || req.user,
      mode: 'edit',
      lob,
      pagination: { page: 1, perPage: 999, total: draft.cards.length }
    });
  } catch (err) {
    console.error('SOP edit load error:', err);
    res.status(500).send('Failed to load SOP editor');
  }
});

router.get('/preview', isAuthenticated, async (req, res) => {
  try {
    const user = req.session?.user || req.user;
    const rawRole = user?.role || '';
    const normalizedRole = ROLE_ALIASES[rawRole] || rawRole.toLowerCase();
    const lob = (req.params.lob || req.session?.user?.lob || 'zomato').toLowerCase().trim();
    const userDept = (user?.department || 'general').toLowerCase().trim();

    const allowed = ['admin', 'quality_analyst', 'team_lead'];
    if (!allowed.includes(normalizedRole) || (normalizedRole !== 'admin' && userDept !== lob)) {
      return res.redirect(`/${lob}/sop/view`);
    }

    const theme = await Theme.findOne({ lob }) || {};

    // Load active draft
    let draft = await SopDraft.findOne({ userId: user._id, lob });
    if (!draft) {
      return res.redirect(`/${lob}/sop/edit`);
    }

    const categoriesMap = {};
    draft.cards.forEach(s => {
      const cat = s.category || 'General';
      if (!categoriesMap[cat]) categoriesMap[cat] = [];
      categoriesMap[cat].push(s);
    });

    const tempCats = draft.template.categories || [];
    const categories = Object.keys(categoriesMap).map(title => {
      const config = tempCats.find(c => c.name.toLowerCase().trim() === title.toLowerCase().trim());
      return {
        title,
        items: categoriesMap[title],
        phase: config ? config.phase : '',
        order: config ? config.order : 999
      };
    }).sort((a, b) => a.order - b.order);

    const allTags = Array.from(new Set(draft.cards.flatMap(s => s.tags || [])));

    res.render('sop_panel', {
      categories, allTags, theme,
      template: draft.template,
      user: req.session?.user || req.user,
      mode: 'preview',
      lob,
      pagination: { page: 1, perPage: 999, total: draft.cards.length }
    });
  } catch (err) {
    console.error('SOP preview load error:', err);
    res.status(500).send('Failed to load SOP preview');
  }
});

// ─── CREATE SOP CATEGORY (Admin/QA/TL) ────────────────────────────────────────
router.post('/category', isAuthenticated, checkSopPermission, async (req, res) => {
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

// ─── CREATE SOP BLOCK UNDER CATEGORY (Admin/QA/TL) ────────────────────────────
router.post('/block', isAuthenticated, checkSopPermission, async (req, res) => {
  try {
    const lob = req?.params?.lob || req?.session?.user?.lob || 'zomato';
    const { category, title, condition, action, tags, status } = req.body;
    if (!category) return res.status(400).json({ error: 'Category required' });

    const sop = await Sop.create({
      lob, category,
      title:     title     || 'New Block',
      condition: condition || '',
      action:    action    || 'Wait',
      tags:      Array.isArray(tags) ? tags : (tags || '').split(',').map(t => t.trim()).filter(Boolean),
      status:    ['Published','Draft','Archived'].includes(status) ? status : 'Draft',
      lastUpdated: {
        at: new Date(),
        by: req.session?.user?.username || 'admin',
        role: req.session?.user?.role   || 'admin'
      }
    });

    res.json({ success: true, data: sop });

    if (sop.status === 'Published') {
      try {
        await Notification.create({
          title: `New SOP Published: ${sop.title}`,
          content: `A new SOP under category "${sop.category}" was published by ${req.session?.user?.username || 'unknown'}.`,
          type: 'sop_update',
          recipientDepartment: sop.lob,
          lob: sop.lob
        });
      } catch (notifErr) {
        console.error('[Notification Trigger] Failed to create SOP publication notification:', notifErr);
      }
    }
  } catch (err) {
    console.error('Block create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── REORDER / PUBLISH LAYOUT (Admin/QA/TL) ───────────────────────────────────
// Body: { order: [ { id: '<sopId>', category: 'New Cat Name' }, ... ] }
// Updates category names for drag-rearranged blocks and publishes them.
router.patch('/reorder', isAuthenticated, checkSopPermission, async (req, res) => {
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

// ─── GET DRAFT FOR LOB ──────────────────────────────────
router.get('/draft', checkSopPermission, async (req, res) => {
  try {
    const lob = (req.params.lob || 'zomato').toLowerCase().trim();
    const user = req.session?.user || req.user;
    const userId = user._id;

    let draft = await SopDraft.findOne({ userId, lob });
    if (!draft) {
      // Initialize draft from live published SOPs and template
      let template = await SopTemplate.findOne({ lob });
      if (!template) {
        // Create default template if none exists
        template = await SopTemplate.create({
          lob,
          headerImage: '',
          googleSheetUrl: '',
          categories: [],
          sidebarConfig: {
            calculator: true,
            callingScript: '"Thank you for contacting customer support. My name is [Agent Name]. How can I assist you today?"',
            quickPrompts: [
              { label: "General Inquiries", text: "I would be happy to check the details and update you. Please hold on for a moment." },
              { label: "Escalation standard", text: "Let me escalate this matter to our senior support desk to get it resolved quickly." }
            ],
            recentUpdates: [
              { date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-'), text: `Default SOP template initialized for ${lob}.` }
            ]
          }
        });
      }

      // Fetch live published cards
      const liveCards = await Sop.find({ lob, status: 'Published' }).sort({ order: 1 });

      draft = await SopDraft.create({
        userId,
        lob,
        template: {
          headerImage: template.headerImage || '',
          googleSheetUrl: template.googleSheetUrl || '',
          sidebarConfig: template.sidebarConfig || {},
          categories: template.categories || []
        },
        cards: liveCards.map(c => c.toObject())
      });
    }

    res.json({ success: true, draft });
  } catch (err) {
    console.error('Error fetching/initializing draft:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST / SAVE DRAFT FOR LOB ──────────────────────────
router.post('/draft', checkSopPermission, async (req, res) => {
  try {
    const lob = (req.params.lob || 'zomato').toLowerCase().trim();
    const user = req.session?.user || req.user;
    const userId = user._id;
    const { template, cards } = req.body;

    let draft = await SopDraft.findOne({ userId, lob });
    if (!draft) {
      draft = new SopDraft({ userId, lob });
    }

    if (template) draft.template = template;
    if (cards) draft.cards = cards;
    draft.updatedAt = new Date();

    await draft.save();
    res.json({ success: true, draft });
  } catch (err) {
    console.error('Error saving draft:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST / PUBLISH DRAFT FOR LOB ───────────────────────
router.post('/publish', checkSopPermission, async (req, res) => {
  try {
    const lob = (req.params.lob || 'zomato').toLowerCase().trim();
    const user = req.session?.user || req.user;

    const draft = await SopDraft.findOne({ userId: user._id, lob });
    if (!draft) {
      return res.status(404).json({ error: 'No working draft found to publish' });
    }

    // Determine new version number
    const lastHistory = await SopHistory.findOne({ lob }).sort({ version: -1 });
    const version = lastHistory ? lastHistory.version + 1 : 1;

    // Calculate changes (optional, but good for summary)
    const changesSummary = [];
    const currentLive = await Sop.find({ lob, status: 'Published' });
    const currentLiveMap = {};
    currentLive.forEach(c => currentLiveMap[c._id?.toString() || c.title] = c);

    draft.cards.forEach(c => {
      const match = currentLiveMap[c._id?.toString() || c.title];
      if (!match) {
        changesSummary.push({ type: 'added', item: c.title });
      } else {
        if (match.title !== c.title || match.condition !== c.condition || match.action !== c.action) {
          changesSummary.push({ type: 'modified', item: c.title });
        }
      }
    });

    // Create history entry
    await SopHistory.create({
      lob,
      version,
      publishedAt: new Date(),
      publishedBy: user.username,
      publishedByRole: user.role,
      templateSnapshot: draft.template,
      cardsSnapshot: draft.cards,
      changesSummary
    });

    // Update Live SopTemplate
    await SopTemplate.findOneAndUpdate(
      { lob },
      {
        headerImage: draft.template.headerImage,
        googleSheetUrl: draft.template.googleSheetUrl,
        sidebarConfig: draft.template.sidebarConfig,
        categories: draft.template.categories
      },
      { upsert: true }
    );

    // Overwrite Live Published cards
    await Sop.deleteMany({ lob, status: 'Published' });

    const cardsToInsert = draft.cards.map((c, i) => ({
      lob,
      category: c.category || 'General',
      phase: c.phase || '',
      title: c.title || 'Untitled SOP',
      condition: c.condition || '',
      action: c.action || 'Wait',
      details: c.details || '',
      tags: c.tags || [],
      status: 'Published',
      order: c.order !== undefined ? c.order : i,
      lastUpdated: {
        at: new Date(),
        by: user.username,
        role: user.role
      }
    }));

    if (cardsToInsert.length) {
      await Sop.insertMany(cardsToInsert);
    }

    // Trigger notification
    try {
      await Notification.create({
        title: `SOP Published: ${lob.toUpperCase()} v${version}`,
        content: `SOP template and cards for department "${lob}" have been successfully published to v${version} by ${user.username}.`,
        type: 'sop_update',
        recipientDepartment: lob,
        lob: lob
      });
    } catch (notifErr) {
      console.error('Failed to trigger publication notification:', notifErr);
    }

    // Delete the working draft
    await SopDraft.deleteOne({ _id: draft._id });

    res.json({ success: true, version });
  } catch (err) {
    console.error('Error publishing draft:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET VERSION HISTORY FOR LOB ────────────────────────
router.get('/history', checkSopPermission, async (req, res) => {
  try {
    const lob = (req.params.lob || 'zomato').toLowerCase().trim();
    const history = await SopHistory.find({ lob }).sort({ version: -1 }).select('version publishedAt publishedBy publishedByRole changesSummary');
    res.json({ success: true, history });
  } catch (err) {
    console.error('Error fetching version history:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET SINGLE VERSION SNAPSHOT ────────────────────────
router.get('/history/:version', checkSopPermission, async (req, res) => {
  try {
    const lob = (req.params.lob || 'zomato').toLowerCase().trim();
    const version = parseInt(req.params.version, 10);
    const snap = await SopHistory.findOne({ lob, version });
    if (!snap) return res.status(404).json({ error: 'Version snapshot not found' });
    res.json({ success: true, snapshot: snap });
  } catch (err) {
    console.error('Error fetching snapshot:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST / ROLLBACK TO VERSION ─────────────────────────
router.post('/rollback/:version', checkSopPermission, async (req, res) => {
  try {
    const lob = (req.params.lob || 'zomato').toLowerCase().trim();
    const version = parseInt(req.params.version, 10);
    const user = req.session?.user || req.user;

    const historyEntry = await SopHistory.findOne({ lob, version });
    if (!historyEntry) {
      return res.status(404).json({ error: `Version v${version} not found in history` });
    }

    const lastHistory = await SopHistory.findOne({ lob }).sort({ version: -1 });
    const newVersion = lastHistory ? lastHistory.version + 1 : 1;

    // Save history entry for the rollback action itself
    await SopHistory.create({
      lob,
      version: newVersion,
      publishedAt: new Date(),
      publishedBy: user.username,
      publishedByRole: user.role,
      templateSnapshot: historyEntry.templateSnapshot,
      cardsSnapshot: historyEntry.cardsSnapshot,
      changesSummary: [{ type: 'rollback', item: `Rolled back to v${version}` }]
    });

    // Restore live template
    await SopTemplate.findOneAndUpdate(
      { lob },
      {
        headerImage: historyEntry.templateSnapshot.headerImage,
        googleSheetUrl: historyEntry.templateSnapshot.googleSheetUrl,
        sidebarConfig: historyEntry.templateSnapshot.sidebarConfig,
        categories: historyEntry.templateSnapshot.categories
      },
      { upsert: true }
    );

    // Restore live cards
    await Sop.deleteMany({ lob, status: 'Published' });
    const cardsToInsert = historyEntry.cardsSnapshot.map((c, i) => ({
      lob,
      category: c.category || 'General',
      phase: c.phase || '',
      title: c.title || 'Untitled SOP',
      condition: c.condition || '',
      action: c.action || 'Wait',
      details: c.details || '',
      tags: c.tags || [],
      status: 'Published',
      order: c.order !== undefined ? c.order : i,
      lastUpdated: {
        at: new Date(),
        by: user.username,
        role: user.role
      }
    }));

    if (cardsToInsert.length) {
      await Sop.insertMany(cardsToInsert);
    }

    // Trigger notification
    try {
      await Notification.create({
        title: `SOP Rolled Back: ${lob.toUpperCase()}`,
        content: `SOP for department "${lob}" has been rolled back to v${version} (now live as v${newVersion}) by ${user.username}.`,
        type: 'sop_update',
        recipientDepartment: lob,
        lob: lob
      });
    } catch (notifErr) {
      console.error('Failed to trigger rollback notification:', notifErr);
    }

    res.json({ success: true, version: newVersion });
  } catch (err) {
    console.error('Error rolling back version:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GOOGLE SHEETS SOURCE LINKING & FETCHING ───────────
router.post('/link-source', checkSopPermission, async (req, res) => {
  try {
    const lob = (req.params.lob || 'zomato').toLowerCase().trim();
    const { url } = req.body;

    const template = await SopTemplate.findOneAndUpdate(
      { lob },
      { googleSheetUrl: url || '' },
      { upsert: true, new: true }
    );

    res.json({ success: true, googleSheetUrl: template.googleSheetUrl });
  } catch (err) {
    console.error('Error linking spreadsheet source:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/fetch-source', checkSopPermission, async (req, res) => {
  try {
    const lob = (req.params.lob || 'zomato').toLowerCase().trim();
    const template = await SopTemplate.findOne({ lob });
    
    const url = req.query.url || template?.googleSheetUrl;
    if (!url) {
      return res.status(400).json({ error: 'No Google Sheet URL is linked to this LOB SOP.' });
    }

    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid Google Sheet URL format.' });
    }

    const sheetId = match[1];
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

    const csvResponse = await fetch(csvUrl);
    if (!csvResponse.ok) {
      return res.status(400).json({ error: 'Failed to fetch public Google Sheet CSV content. Ensure the sheet is Shared to "Anyone with the link can view".' });
    }

    const csvText = await csvResponse.text();
    
    const parseCSV = (text) => {
      const lines = [];
      let row = [];
      let inQuotes = false;
      let currentVal = '';

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
          if (char === '"') {
            if (nextChar === '"') {
              currentVal += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            currentVal += char;
          }
        } else {
          if (char === '"') {
            inQuotes = true;
          } else if (char === ',') {
            row.push(currentVal.trim());
            currentVal = '';
          } else if (char === '\n' || char === '\r') {
            row.push(currentVal.trim());
            if (row.some(val => val !== '')) {
              lines.push(row);
            }
            row = [];
            currentVal = '';
            if (char === '\r' && nextChar === '\n') {
              i++;
            }
          } else {
            currentVal += char;
          }
        }
      }
      if (currentVal || row.length > 0) {
        row.push(currentVal.trim());
        if (row.some(val => val !== '')) {
          lines.push(row);
        }
      }

      if (lines.length === 0) return [];

      const headers = lines[0].map(h => h.toLowerCase().trim());
      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const obj = {};
        const values = lines[i];
        headers.forEach((header, idx) => {
          obj[header] = values[idx] || '';
        });
        data.push(obj);
      }
      return data;
    };

    const parsedData = parseCSV(csvText);
    res.json({ success: true, data: parsedData });
  } catch (err) {
    console.error('Error fetching sheet source:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET LIVE published template and cards ─────────────
router.get('/live', checkSopPermission, async (req, res) => {
  try {
    const lob = (req.params.lob || 'zomato').toLowerCase().trim();
    const template = await SopTemplate.findOne({ lob }) || { sidebarConfig: {}, categories: [] };
    const cards = await Sop.find({ lob, status: 'Published' }).sort({ order: 1 });
    res.json({ success: true, template, cards });
  } catch (err) {
    console.error('Error fetching live data:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST / CHAT WITH GEMINI ───────────────────────────
router.post('/chat', checkSopPermission, async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const systemPrompt = `You are an AI assistant helping a Zomato WIMO (Where Is My Order) SOP editor.
Your task is to help them write, edit, and optimize SOP policies and cards.
Current Context (if any): ${context ? JSON.stringify(context) : 'None'}

Please answer the editor's question or help them draft a card/policy. Keep your response brief, helpful, and concise.`;

    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent([
      { text: systemPrompt },
      { text: message }
    ]);
    const responseText = result.response.text().trim();
    res.json({ success: true, reply: responseText });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;