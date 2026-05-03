# SupportHub — Department Multi-Tenancy Implementation Plan

## What's Done Already (This Session)

| Feature | Status | Details |
|---|---|---|
| `/view` route — read-only | ✅ Done | `mode:'view'` renders no edit controls |
| `/edit` route — admin/QA only | ✅ Done | `GET /:lob/sop/edit` with `checkRole` |
| Add Category | ✅ Done | `POST /:lob/sop/category` |
| Add Block under Category | ✅ Done | `POST /:lob/sop/block` |
| Drag-to-reorder + Save Layout | ✅ Done | SortableJS + `PATCH /:lob/sop/reorder` |
| Edit mode toolbar | ✅ Done | Sticky banner with Add/Save/View buttons |
| Old edit injection removed | ✅ Done | No edit buttons on `/view` route |
| `Department` model created | ✅ Done | `models/Department.js` |

---

## Remaining Work — Prioritized Roadmap

### Phase 1 — Department CRUD (Admin/Vendor)

> [!IMPORTANT]
> This is the foundational piece. Everything in Phase 2+ depends on it.

**Backend — `routes/api/departmentRoutes.js`**

```js
GET    /api/departments          // list all (admin/vendor)
POST   /api/departments          // create new dept (admin/vendor)
PUT    /api/departments/:id      // rename / update theme
DELETE /api/departments/:id      // deactivate (soft delete)
GET    /api/departments/:id/users // list users in dept
PUT    /api/departments/:id/users/:userId // assign user to dept
```

**Frontend — Admin Panel tab: "Departments"**
- Grid of department cards with name, slug, user count, theme swatch
- "＋ New Department" modal (name → auto-slugified, color picker)
- Per-department: Edit colours, View SOP, Open Edit mode

---

### Phase 2 — User ↔ Department Assignment

**User model change** — add `department` field:
```js
// models/User.js  (add to existing schema)
department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null }
```

**Migration script** — assign existing users to a default department (e.g. `zomato`):
```js
// scripts/migrateDepartments.js
const def = await Department.findOne({ slug: 'zomato' });
await User.updateMany({ department: null }, { department: def._id });
```

**Admin UI** — in the existing Users table:
- Add "Department" column with a select dropdown
- `PUT /api/admin/users/:id/department` endpoint

---

### Phase 3 — Scope All Resources to Department

Each resource model needs a `department` field (ObjectId ref). Apply to:

| Model | Field to add |
|---|---|
| `CandResponse` / Category | `department: { type: ObjectId, ref: 'Department' }` |
| `PrivateNote` | `department: ObjectId` |
| `Sop` | `department: ObjectId` (alongside current `lob` string) |
| `Feedback` | `department: ObjectId` |
| `Message` | `department: ObjectId` |
| `Notice` | `department: ObjectId` |

**Query filter pattern** — all controllers change from `{ lob }` to:
```js
// Middleware injects req.department from session
const dept = req.session?.user?.department;
Model.find({ department: dept });
```

> [!WARNING]
> Migration needed for existing data. Run a script that looks up the `Department` with matching `slug === lob` and back-fills the `department` ObjectId on all existing documents.

---

### Phase 4 — Auth Middleware Enhancement

Create `deptMiddleware.js`:
```js
// Attaches req.department (ObjectId) from session user
// Validates that /:deptSlug in the URL matches the user's assigned dept
// Admins/Vendors bypass the department check (can access all)
module.exports.requireDept = (req, res, next) => {
  const slug = req.params.lob;  // comes from /:lob/sop/* route
  const userDept = req.session?.user?.department;
  if (!slug || !userDept) return next(); // anonymous or no slug — let route handle
  Department.findOne({ slug }).then(dept => {
    if (!dept) return res.status(404).send('Department not found');
    req.departmentDoc = dept;
    // Admins bypass dept check
    const role = req.session?.user?.role;
    if (['admin','vendor'].includes(role)) return next();
    if (String(userDept) !== String(dept._id)) return res.status(403).send('Access denied');
    next();
  }).catch(next);
};
```

Mount in `app.js`:
```js
app.use('/:lob/sop', requireDept, sopRoutes);
```

---

### Phase 5 — Navigation & URL Structure

**Current** (single LOB, hardcoded):
```
/zomato/sop/view
/zomato/sop/edit
```

**Target** (scalable, per-department):
```
/:deptSlug/sop/view    →  any authenticated user in that dept
/:deptSlug/sop/edit    →  admin/QA only
```

URL examples from the request:
```
/zomato/wimo-AI-Handover/sop/edit   ← nested dept (sub-team)
```
For nested teams, consider a two-segment scheme: `/:org/:team/sop/edit`  
→ mount as `app.use('/:org/:team/sop', sopRoutes)` and concatenate `org+team` as the slug.

---

### Phase 6 — Admin Department Management UI

In `adminPanel.ejs` — add a new "Departments" tab:

```
┌────────────────────────────────────────────────────────┐
│  DEPARTMENTS                              [＋ New Dept] │
├────────────────────────────────────────────────────────┤
│  🏢 Zomato         /zomato       12 users  [Edit][SOP] │
│  🤖 Wimo AI HO     /wimo-ai-ho    4 users  [Edit][SOP] │
│  📦 Blinkit Ops    /blinkit-ops   8 users  [Edit][SOP] │
└────────────────────────────────────────────────────────┘
```

Each row:
- **Edit** → modal to change name, slug, theme colours
- **SOP** → opens `/:slug/sop/edit`
- User count badge

---

## File Change Summary

```
models/
  Department.js          ✅ Created
  User.js                🔜 Add department field
  Sop.js                 🔜 Add department ObjectId
  PrivateNote.js         🔜 Add department ObjectId
  CannedResponse.js      🔜 Add department ObjectId
  [others]               🔜 Add department ObjectId

routes/
  sopRoutes.js           ✅ /edit + /category + /block + /reorder added
  api/departmentRoutes.js 🔜 New file (CRUD for departments)
  api/userRoutes.js      🔜 Add dept assignment endpoint

middleware/
  deptMiddleware.js      🔜 New file (dept scope validation)

views/
  sop_panel.ejs          ✅ Mode-gated edit system, no edit on /view
  partials/adminPanel.ejs 🔜 Add Departments tab

scripts/
  migrateDepartments.js  🔜 Back-fill existing data
```

---

## Quick-Start for Next Session

1. Run `GET /api/departments` → should return empty array (model ready)
2. Create first department via admin panel: name=Zomato, slug=zomato
3. Assign users → test that `/zomato/sop/view` is accessible, `/blinkit-ops/sop/view` is denied
4. Verify edit buttons **only** appear at `/:lob/sop/edit` for admin/QA
