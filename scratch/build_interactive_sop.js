const fs = require('fs');
const path = require('path');

const ejsPath = path.join(__dirname, '..', 'views', 'sop_panel.ejs');
const html = fs.readFileSync(ejsPath, 'utf8');

// 1. Extract head, styles and name modals
const layoutIdx = html.indexOf('<div class="layout">');
if (layoutIdx === -1) {
    console.error('Could not find layout start');
    process.exit(1);
}
let part1 = html.substring(0, layoutIdx);

// Inject additional stylesheet definitions for edit mode
const styleCloseIdx = part1.lastIndexOf('</style>');
const customStyles = `
        /* ─── SOP EDITOR CUSTOM STYLES ───────────────────────────────── */
        .mode-btn {
            background: rgba(255, 255, 255, 0.15);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.35);
            padding: 8px 14px;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            font-size: 0.8rem;
            transition: background 0.2s, border-color 0.2s, color 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: inherit;
        }
        .mode-btn:hover {
            background: rgba(255, 255, 255, 0.3);
            border-color: white;
        }
        .mode-btn.active {
            background: white;
            color: var(--z-red);
            border-color: white;
        }
        .card-edit-overlay {
            position: absolute;
            top: 6px;
            right: 6px;
            display: none;
            gap: 4px;
            background: rgba(255, 255, 255, 0.95);
            padding: 4px 6px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 10;
        }
        body.edit-mode-active .card-edit-overlay {
            display: flex;
        }
        .btn-card-action {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 0.8rem;
            padding: 4px;
            color: #64748b;
            border-radius: 4px;
            transition: background 0.15s, color 0.15s;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
        }
        .btn-card-action:hover {
            background: #f1f5f9;
            color: #0f172a;
        }
        .btn-card-action.delete:hover {
            background: #fee2e2;
            color: #ef4444;
        }
        .btn-card-action.edit:hover {
            background: #dbeafe;
            color: #2563eb;
        }
        body.edit-mode-active .sop-card {
            border-color: #cbd5e1;
            background: #fafafa;
        }
`;
part1 = part1.substring(0, styleCloseIdx) + customStyles + part1.substring(styleCloseIdx);

// 2. Build the dynamic body and category rendering
const dynamicBody = `
<div class="layout">
   <header class="search-section">
      <img class="h-8 w-auto" src="https://b.zmtcdn.com/web_assets/8313a97515fcb0447d2d77c276532a511583262271.png" loading="eager" height="30" alt="Zomato">
      <input type="text" id="sopSearch" placeholder="Search scenario (e.g., 'mall', 'device', 'spillage')..." onkeyup="filterSOP()">
      
      <% if (user && ['admin', 'quality_analyst', 'team_lead'].includes(user.role)) { %>
         <div class="mode-toggle-container" style="display:flex;align-items:center;gap:8px;margin-left:auto;">
             <button id="toggleEditModeBtn" class="mode-btn" onclick="toggleEditMode()">
                 <i class="fa fa-pencil"></i> Manage SOP
             </button>
             <button id="addCatBtn" class="mode-btn edit-only" onclick="addCategory()" style="display:none;">
                 <i class="fa fa-plus"></i> Add Category
             </button>
         </div>
      <% } %>
      <a href="/" style="<%= (user && ['admin', 'quality_analyst', 'team_lead'].includes(user.role)) ? 'margin-left:12px;' : 'margin-left:auto;' %>"><i class="fa fa-home" style="font-size:36px; color:white;"></i></a>
   </header>

   <main class="sop-container">
   <% if (!categories || categories.length === 0) { %>
      <p style="padding:20px;text-align:center;color:#64748b;">No categories or cards created yet.</p>
   <% } else { %>
      <% categories.forEach(function(cat){ %>
         <div class="category-block" data-category="<%= cat.category %>" data-phase="<%= cat.phase %>">
            <div class="category-title" style="display:flex;justify-content:space-between;align-items:center;">
               <div>
                   <span class="cat-name" style="font-weight:700;"><%= cat.category %></span>
                   <span class="cat-phase" style="font-size:0.85rem;font-weight:normal;color:#666;margin-left:8px;"><%= cat.phase %></span>
               </div>
               <% if (user && ['admin', 'quality_analyst', 'team_lead'].includes(user.role)) { %>
                  <div class="cat-edit-actions edit-only" style="display:none;gap:6px;">
                     <button class="mode-btn" onclick="editCategory('<%= cat.category %>', '<%= cat.phase %>')" style="padding:4px 8px;font-size:0.75rem;background:#f1f5f9;color:#475569;border-color:#cbd5e1;"><i class="fa fa-pencil"></i> Rename</button>
                     <button class="mode-btn" onclick="deleteCategory('<%= cat.category %>')" style="padding:4px 8px;font-size:0.75rem;background:#fee2e2;color:#ef4444;border-color:#fca5a5;"><i class="fa fa-trash"></i> Delete</button>
                  </div>
               <% } %>
            </div>
            <div class="sop-grid" data-category="<%= cat.category %>">
               <% cat.items.forEach(function(sop){ %>
                  <div class="sop-card" 
                       data-id="<%= sop._id %>"
                       data-tags="<%= (sop.tags || []).join(' ') %>"
                       onclick="openSopModal(this)">
                     <div class="card-header"><%= sop.title %></div>
                     <div class="card-cond"><%= sop.condition %></div>
                     <span class="action-tag tag-<%= (sop.action && sop.action.toLowerCase().includes('cancel')) ? 'cancel' : (sop.action && sop.action.toLowerCase().includes('escalate')) ? 'esc' : 'wait' %>">
                         <%= sop.action %>
                     </span>
                     <div class="expand-hint"><i class="fa fa-expand"></i> View full SOP</div>
                     <div class="card-detail-data" style="display:none"><%= sop.details %></div>
                     
                     <% if (user && ['admin', 'quality_analyst', 'team_lead'].includes(user.role)) { %>
                        <div class="card-edit-overlay" onclick="event.stopPropagation()">
                           <button class="btn-card-action edit" onclick="editCard('<%= sop._id %>')" title="Edit"><i class="fa fa-pencil"></i></button>
                           <button class="btn-card-action move-up" onclick="moveCard('<%= sop._id %>', 'up')" title="Move Up"><i class="fa fa-arrow-up"></i></button>
                           <button class="btn-card-action move-down" onclick="moveCard('<%= sop._id %>', 'down')" title="Move Down"><i class="fa fa-arrow-down"></i></button>
                           <button class="btn-card-action delete" onclick="deleteCard('<%= sop._id %>')" title="Delete"><i class="fa fa-trash"></i></button>
                        </div>
                     <% } %>
                  </div>
               <% }) %>
               <% if (user && ['admin', 'quality_analyst', 'team_lead'].includes(user.role)) { %>
                  <div class="sop-card add-card-placeholder edit-only" onclick="addCard('<%= cat.category %>', '<%= cat.phase %>')" style="display:none;justify-content:center;align-items:center;border:2px dashed #ccc;background:none;height:120px;">
                     <div style="font-size:2rem;color:#94a3b8;margin-bottom:4px;">＋</div>
                     <div style="color:#64748b;font-size:0.8rem;font-weight:700;">Add Card</div>
                  </div>
               <% } %>
            </div>
         </div>
      <% }) %>
   <% } %>
   </main>
`;

// 3. Extract Sidebar & Details Modal
const asideIdx = html.indexOf('<aside class="sidebar">');
const scriptIdx = html.indexOf('<!-- ═══════════════════════════════════════════════════════════════════\r\n     CORE SOP SCRIPTS');
const scriptIdxUnix = html.indexOf('<!-- ═══════════════════════════════════════════════════════════════════\n     CORE SOP SCRIPTS');
const finalScriptIdx = scriptIdx !== -1 ? scriptIdx : scriptIdxUnix;

if (asideIdx === -1 || finalScriptIdx === -1) {
    console.error('Could not find sidebar or script index');
    process.exit(1);
}

const part2 = html.substring(asideIdx, finalScriptIdx);

// 4. Extract bottom scripts
const docCloseIdx = html.indexOf('</body>');
const part3 = html.substring(finalScriptIdx, docCloseIdx);

// 5. Add custom JS for editing SOP
const customScripts = `
<script>
    // Toggle Edit Mode
    function toggleEditMode() {
        const btn = document.getElementById('toggleEditModeBtn');
        const isEdit = document.body.classList.toggle('edit-mode-active');
        
        if (isEdit) {
            btn.classList.add('active');
            btn.innerHTML = \`<i class="fa fa-eye"></i> View Mode\`;
            document.querySelectorAll('.edit-only').forEach(el => el.style.display = 'flex');
            document.querySelectorAll('.cat-edit-actions').forEach(el => el.style.display = 'flex');
            document.querySelectorAll('.add-card-placeholder').forEach(el => el.style.display = 'flex');
        } else {
            btn.classList.remove('active');
            btn.innerHTML = \`<i class="fa fa-pencil"></i> Manage SOP\`;
            document.querySelectorAll('.edit-only').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.cat-edit-actions').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.add-card-placeholder').forEach(el => el.style.display = 'none');
        }
    }

    // Modal helpers
    function escapeHtmlAttr(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Category Operations
    function addCategory() {
        const backdrop = buildBackdrop('catModalBackdrop');
        backdrop.innerHTML = \`
            <div style="background:#fff;border-radius:14px;padding:28px 32px;width:480px;max-width:97%;box-shadow:0 20px 60px rgba(0,0,0,.25);position:relative;box-sizing:border-box;">
                <button onclick="document.getElementById('catModalBackdrop').remove()" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.3rem;cursor:pointer;">✕</button>
                <h3 style="margin:0 0 16px;font-size:1.1rem;color:var(--z-red);font-family:inherit;">＋ Add New Category</h3>
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;font-family:inherit;">CATEGORY NAME *</label>
                <input id="cat-name" type="text" placeholder="e.g. 07. POST-DELIVERY CONCERNS" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:14px;box-sizing:border-box;">
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;font-family:inherit;">PHASE INFO (optional)</label>
                <input id="cat-phase" type="text" placeholder="e.g. (Phase: Delivery Done)" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:18px;box-sizing:border-box;">
                <button id="saveCatBtn" class="mode-btn" style="width:100%;padding:12px;background:var(--z-red);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:.9rem;justify-content:center;box-sizing:border-box;font-family:inherit;">Create Category</button>
            </div>
        \`;
        document.body.appendChild(backdrop);
        document.getElementById('saveCatBtn').addEventListener('click', async () => {
            const category = document.getElementById('cat-name').value.trim();
            const phase = document.getElementById('cat-phase').value.trim();
            if (!category) { alert('Category name is required.'); return; }
            try {
                const res = await fetch('/api/sop/category', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category, phase })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to create category');
                location.reload();
            } catch (err) { alert(err.message); }
        });
    }

    function editCategory(oldCategory, oldPhase) {
        const backdrop = buildBackdrop('catModalBackdrop');
        backdrop.innerHTML = \`
            <div style="background:#fff;border-radius:14px;padding:28px 32px;width:480px;max-width:97%;box-shadow:0 20px 60px rgba(0,0,0,.25);position:relative;box-sizing:border-box;">
                <button onclick="document.getElementById('catModalBackdrop').remove()" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.3rem;cursor:pointer;">✕</button>
                <h3 style="margin:0 0 16px;font-size:1.1rem;color:var(--z-red);font-family:inherit;">✏️ Rename Category</h3>
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;font-family:inherit;">CATEGORY NAME *</label>
                <input id="cat-name" type="text" value="\${escapeHtmlAttr(oldCategory)}" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:14px;box-sizing:border-box;">
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;font-family:inherit;">PHASE INFO</label>
                <input id="cat-phase" type="text" value="\${escapeHtmlAttr(oldPhase)}" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:18px;box-sizing:border-box;">
                <button id="saveCatBtn" class="mode-btn" style="width:100%;padding:12px;background:var(--z-red);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:.9rem;justify-content:center;box-sizing:border-box;font-family:inherit;">Save Changes</button>
            </div>
        \`;
        document.body.appendChild(backdrop);
        document.getElementById('saveCatBtn').addEventListener('click', async () => {
            const newCategory = document.getElementById('cat-name').value.trim();
            const phase = document.getElementById('cat-phase').value.trim();
            if (!newCategory) { alert('Category name is required.'); return; }
            try {
                const res = await fetch('/api/sop/category', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldCategory, newCategory, phase })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to update category');
                location.reload();
            } catch (err) { alert(err.message); }
        });
    }

    async function deleteCategory(category) {
        if (!confirm(\`Are you sure you want to delete the category "\${category}" and all its SOP cards? This action cannot be undone.\`)) return;
        try {
            const res = await fetch('/api/sop/category', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete category');
            location.reload();
        } catch (err) { alert(err.message); }
    }

    // Card Operations
    function addCard(category, phase) {
        const backdrop = buildBackdrop('cardModalBackdrop');
        backdrop.innerHTML = \`
            <div style="background:#fff;border-radius:14px;padding:28px 32px;width:600px;max-width:97%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);position:relative;box-sizing:border-box;font-family:inherit;">
                <button onclick="document.getElementById('cardModalBackdrop').remove()" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.3rem;cursor:pointer;">✕</button>
                <h3 style="margin:0 0 16px;font-size:1.1rem;color:var(--z-red);">＋ Add Card in "\${escapeHtmlAttr(category)}"</h3>
                
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">CARD TITLE *</label>
                <input id="card-title" type="text" placeholder="Scenario title" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:12px;box-sizing:border-box;">
                
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">CONDITION *</label>
                <input id="card-cond" type="text" placeholder="Trigger condition" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:12px;box-sizing:border-box;">
                
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">ACTION TAG TEXT *</label>
                <input id="card-action" type="text" placeholder="e.g. Cancel if Delay >40m" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:12px;box-sizing:border-box;">
                
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">SEARCH TAGS (comma-separated)</label>
                <input id="card-tags" type="text" placeholder="e.g. delay, food, cancel" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:12px;box-sizing:border-box;">
                
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">DETAILED INSTRUCTIONS (Markdown/HTML/Text) *</label>
                <textarea id="card-details" rows="8" placeholder="Bullet points, guidelines..." style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.88rem;resize:vertical;margin-bottom:18px;box-sizing:border-box;"></textarea>
                
                <button id="saveCardBtn" class="mode-btn" style="width:100%;padding:12px;background:var(--z-red);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:.9rem;justify-content:center;box-sizing:border-box;font-family:inherit;">Create Card</button>
            </div>
        \`;
        document.body.appendChild(backdrop);
        document.getElementById('saveCardBtn').addEventListener('click', async () => {
            const title = document.getElementById('card-title').value.trim();
            const condition = document.getElementById('card-cond').value.trim();
            const action = document.getElementById('card-action').value.trim();
            const details = document.getElementById('card-details').value;
            const tags = document.getElementById('card-tags').value;
            
            if (!title || !condition || !action || !details) {
                alert('Please fill out all required fields.');
                return;
            }
            
            try {
                const res = await fetch('/api/sop/card', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category, phase, title, condition, action, details, tags })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to create card');
                location.reload();
            } catch (err) { alert(err.message); }
        });
    }

    function editCard(sopId) {
        const card = document.querySelector(\`.sop-card[data-id="\${sopId}"]\`);
        const title = card.querySelector('.card-header')?.innerText || '';
        const cond = card.querySelector('.card-cond')?.innerText || '';
        const action = card.querySelector('.action-tag')?.innerText || '';
        const details = card.querySelector('.card-detail-data')?.innerText || '';
        const tags = card.dataset.tags || '';
        
        const backdrop = buildBackdrop('cardModalBackdrop');
        backdrop.innerHTML = \`
            <div style="background:#fff;border-radius:14px;padding:28px 32px;width:600px;max-width:97%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25);position:relative;box-sizing:border-box;font-family:inherit;">
                <button onclick="document.getElementById('cardModalBackdrop').remove()" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:1.3rem;cursor:pointer;">✕</button>
                <h3 style="margin:0 0 16px;font-size:1.1rem;color:var(--z-red);">✏️ Edit SOP Card</h3>
                
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">CARD TITLE *</label>
                <input id="card-title" type="text" value="\${escapeHtmlAttr(title)}" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:12px;box-sizing:border-box;">
                
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">CONDITION *</label>
                <input id="card-cond" type="text" value="\${escapeHtmlAttr(cond)}" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:12px;box-sizing:border-box;">
                
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">ACTION TAG TEXT *</label>
                <input id="card-action" type="text" value="\${escapeHtmlAttr(action)}" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:12px;box-sizing:border-box;">
                
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">SEARCH TAGS (comma-separated)</label>
                <input id="card-tags" type="text" value="\${escapeHtmlAttr(tags.split(' ').join(', '))}" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.9rem;margin-bottom:12px;box-sizing:border-box;">
                
                <label style="font-size:.75rem;font-weight:700;color:#64748b;display:block;margin-bottom:4px;">DETAILED INSTRUCTIONS (Markdown/HTML/Text) *</label>
                <textarea id="card-details" rows="8" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:.88rem;resize:vertical;margin-bottom:18px;box-sizing:border-box;">\${escapeHtmlAttr(details)}</textarea>
                
                <button id="saveCardBtn" class="mode-btn" style="width:100%;padding:12px;background:var(--z-red);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:.9rem;justify-content:center;box-sizing:border-box;font-family:inherit;">Save Changes</button>
            </div>
        \`;
        document.body.appendChild(backdrop);
        document.getElementById('saveCardBtn').addEventListener('click', async () => {
            const title = document.getElementById('card-title').value.trim();
            const condition = document.getElementById('card-cond').value.trim();
            const action = document.getElementById('card-action').value.trim();
            const details = document.getElementById('card-details').value;
            const tags = document.getElementById('card-tags').value;
            
            if (!title || !condition || !action || !details) {
                alert('Please fill out all required fields.');
                return;
            }
            
            try {
                const res = await fetch(\`/api/sop/card/\${sopId}\`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, condition, action, details, tags })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to update card');
                location.reload();
            } catch (err) { alert(err.message); }
        });
    }

    async function deleteCard(sopId) {
        if (!confirm('Are you sure you want to delete this SOP card permanently? This action cannot be undone.')) return;
        try {
            const res = await fetch(\`/api/sop/card/\${sopId}\`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete card');
            location.reload();
        } catch (err) { alert(err.message); }
    }

    async function moveCard(cardId, direction) {
        try {
            const res = await fetch('/api/sop/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardId, direction })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to reorder');
            location.reload();
        } catch (err) { alert(err.message); }
    }
</script>
`;

// Re-override openSopModal logic
const modalOverrideScript = `
<script>
    // Overriding the openModal to handle dynamic elements and fallback compile markdown/html rendering
    function openSopModal(card) {
        const title      = card.querySelector('.card-header').innerText;
        const cond       = card.querySelector('.card-cond').innerText;
        const actionTag  = card.querySelector('.action-tag');
        const detailText = card.querySelector('.card-detail-data').innerText;
        const tagClass   = actionTag.className.replace('action-tag ', '');

        document.getElementById('modalTitle').innerText = title;
        document.getElementById('modalCond').innerText  = cond;

        const tagEl      = document.getElementById('modalTag');
        tagEl.innerText  = actionTag.innerText;
        tagEl.className  = 'modal-tag action-tag ' + tagClass;

        // Try compiling using marked.js if loaded, otherwise format bullets
        let bodyHtml = '';
        if (typeof marked !== 'undefined') {
            try {
                // Decode HTML entities before parsing Markdown
                const txt = document.createElement('textarea');
                txt.innerHTML = detailText;
                bodyHtml = marked.parse(txt.value);
            } catch (e) {
                console.error(e);
            }
        }
        
        if (!bodyHtml) {
            bodyHtml = detailText
                .split('\\n').map(line => {
                    line = line.trim();
                    if (!line) return '<br>';
                    if (line.startsWith('•')) return '<span style="display:block;margin:4px 0;">• ' + line.slice(1).trim() + '</span>';
                    if (/^(Case|Note|⚠️|Special|Example|Prompt|Important|Minor|Major)/i.test(line))
                        return '<strong style="display:block;margin-top:10px;">' + line + '</strong>';
                    return '<span style="display:block;">' + line + '</span>';
                }).join('');
        }

        document.getElementById('modalBody').innerHTML = bodyHtml;
        document.getElementById('modalOverlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }
</script>
`;

const outputHtml = part1 + dynamicBody + part2 + part3 + customScripts + modalOverrideScript + '\n</body>\n</html>';
const outputPath = path.join(__dirname, '..', 'views', 'sop_interactive.ejs');
fs.writeFileSync(outputPath, outputHtml, 'utf8');
console.log(`Successfully compiled and wrote views/sop_interactive.ejs (${outputHtml.length} bytes)`);
