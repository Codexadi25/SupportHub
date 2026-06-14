// Client-side script for AI Cands Tab
document.addEventListener('DOMContentLoaded', () => {
    // Determine current LOB from URL or window variable
    const pathParts = window.location.pathname.split('/');
    const lob = window.location.pathname.startsWith('/zomato') ? 'zomato' : (pathParts[1] || 'zomato');
    const apiBase = `/api/${lob}/ai-cand`;
    const candsApiBase = `/api/${lob}/cands`;

    // Cache elements
    const tagsList = document.getElementById('ai-generator-tags-list');
    const createTagBtn = document.getElementById('btn-create-tag-trigger');
    const createTagBox = document.getElementById('create-tag-box');
    const saveTagBtn = document.getElementById('btn-save-tag');
    const newTagInput = document.getElementById('new-tag-input');
    const newTagVisibility = document.getElementById('new-tag-visibility');

    const generateBtn = document.getElementById('btn-generate-response');
    const contextInput = document.getElementById('ai-context-input');
    const outputContainer = document.getElementById('ai-output-container');
    const outputBox = document.getElementById('ai-output-box');
    const copyOutputBtn = document.getElementById('btn-copy-ai-output');
    const rephraseOutputBtn = document.getElementById('btn-rephrase-ai-output');
    const saveAdminCandBtn = document.getElementById('btn-save-as-admin-cand');

    const adminPromptToggle = document.getElementById('btn-admin-prompt-toggle');
    const adminPromptPanel = document.getElementById('admin-prompt-panel');
    const adminPromptTextarea = document.getElementById('admin-prompt-textarea');
    const adminPromptSave = document.getElementById('btn-admin-prompt-save');

    const officialCandsList = document.getElementById('ai-cands-list');
    const officialCandsCount = document.getElementById('ai-cands-count');
    const localSearchInput = document.getElementById('ai-cands-search-input');

    // Modals
    const editModal = document.getElementById('edit-ai-cand-modal');
    const closeEditModal = document.getElementById('close-edit-ai-cand-modal');
    const cancelEditBtn = document.getElementById('btn-cancel-edit-ai-cand');
    const saveEditBtn = document.getElementById('btn-save-edit-ai-cand');
    const editCandText = document.getElementById('edit-ai-cand-text');
    const editCandTagsList = document.getElementById('edit-ai-cand-tags-list');

    // State
    let availableTags = [];
    let officialCands = [];
    let selectedTagIds = new Set();
    let currentGeneratedText = '';
    let currentEditCandId = null;

    // Load initial data
    fetchTags();
    fetchOfficialCands();
    if (adminPromptTextarea) {
        fetchPromptTemplate();
    }

    // Toggle custom tag panel
    createTagBtn?.addEventListener('click', () => {
        const isHidden = createTagBox.style.display === 'none';
        createTagBox.style.display = isHidden ? 'block' : 'none';
        createTagBtn.textContent = isHidden ? '➖ Hide Tag Builder' : '➕ Add Custom Tag';
    });

    // Save custom tag
    saveTagBtn?.addEventListener('click', async () => {
        const name = newTagInput?.value || '';
        const visibility = newTagVisibility?.value || 'private';
        if (!name.trim()) return showToast('Please enter a tag name', 'error');

        try {
            const response = await fetch(`${apiBase}/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, visibility })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to save tag');

            showToast('Tag added successfully!', 'success');
            newTagInput.value = '';
            createTagBox.style.display = 'none';
            createTagBtn.textContent = '➕ Add Custom Tag';
            fetchTags();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Toggle tag selection
    tagsList?.addEventListener('click', (e) => {
        const chip = e.target.closest('.tag-chip');
        if (!chip) return;
        const tagId = chip.dataset.id;
        if (selectedTagIds.has(tagId)) {
            selectedTagIds.delete(tagId);
            chip.classList.remove('selected');
            chip.style.background = '';
            chip.style.borderColor = '';
            chip.style.color = '';
        } else {
            selectedTagIds.add(tagId);
            chip.classList.add('selected');
            chip.style.background = 'rgba(37,99,235,0.1)';
            chip.style.borderColor = 'var(--clr-primary, #2563eb)';
            chip.style.color = 'var(--clr-primary, #2563eb)';
        }
    });

    // Generate AI response
    generateBtn?.addEventListener('click', async () => {
        if (selectedTagIds.size === 0) {
            return showToast('Please select at least one tag/sentence chunk', 'error');
        }

        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span>⏳</span> Generating response...';
        outputContainer.style.display = 'none';

        try {
            const response = await fetch(`${apiBase}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tagIds: Array.from(selectedTagIds),
                    extraContext: contextInput.value
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Generation failed');

            currentGeneratedText = data.text;
            outputBox.textContent = data.text;
            outputContainer.style.display = 'block';
            showToast('Response generated!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<span>✨</span> Generate Response';
        }
    });

    // Copy generated text
    copyOutputBtn?.addEventListener('click', () => {
        if (!currentGeneratedText) return;
        navigator.clipboard.writeText(currentGeneratedText)
            .then(() => showToast('Copied to clipboard!', 'success'))
            .catch(() => showToast('Failed to copy', 'error'));
    });

    // Rephrase generated text
    rephraseOutputBtn?.addEventListener('click', async () => {
        if (!currentGeneratedText) return;
        rephraseOutputBtn.disabled = true;
        rephraseOutputBtn.innerHTML = '<span>⏳</span> Rephrasing...';

        try {
            const response = await fetch(`${candsApiBase}/rephrase-ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: currentGeneratedText })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Rephrase failed');

            currentGeneratedText = data.text;
            outputBox.textContent = data.text;
            showToast('Response rephrased!', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            rephraseOutputBtn.disabled = false;
            rephraseOutputBtn.innerHTML = '🔄 Rephrase';
        }
    });

    // Save as admin canned response (AiCand)
    saveAdminCandBtn?.addEventListener('click', async () => {
        if (!currentGeneratedText) return;
        saveAdminCandBtn.disabled = true;
        
        try {
            const response = await fetch(`${apiBase}/admin-cands`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: currentGeneratedText,
                    tagIds: Array.from(selectedTagIds)
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to save');

            showToast('Saved to Official AI Cands!', 'success');
            outputContainer.style.display = 'none';
            currentGeneratedText = '';
            contextInput.value = '';
            
            // Reset tag selection
            selectedTagIds.clear();
            document.querySelectorAll('.tag-chip').forEach(c => {
                c.classList.remove('selected');
                c.style.background = '';
                c.style.borderColor = '';
                c.style.color = '';
            });

            fetchOfficialCands();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            saveAdminCandBtn.disabled = false;
        }
    });

    // Admin toggle prompt panel
    adminPromptToggle?.addEventListener('click', () => {
        const isHidden = adminPromptPanel.style.display === 'none';
        adminPromptPanel.style.display = isHidden ? 'block' : 'none';
    });

    // Save prompt template
    adminPromptSave?.addEventListener('click', async () => {
        const template = adminPromptTextarea.value;
        if (!template.trim()) return showToast('Template is required', 'error');

        adminPromptSave.disabled = true;
        try {
            const response = await fetch(`${apiBase}/prompt`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to save prompt');

            showToast('Prompt template saved successfully!', 'success');
            adminPromptPanel.style.display = 'none';
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            adminPromptSave.disabled = false;
        }
    });

    // Handle local search
    localSearchInput?.addEventListener('input', () => {
        filterCandsList(localSearchInput.value);
    });

    // Fetch tags
    async function fetchTags() {
        try {
            const response = await fetch(`${apiBase}/tags`);
            const data = await response.json();
            if (response.ok && data.tags) {
                availableTags = data.tags;
                renderTagsList();
            }
        } catch (err) {
            console.error('Error fetching tags:', err);
        }
    }

    // Render tags chips list
    function renderTagsList() {
        if (!tagsList) return;
        if (availableTags.length === 0) {
            tagsList.innerHTML = '<div style="font-size: 0.8rem; color: var(--clr-text-muted, #64748b); padding: 8px;">No tags created yet. Create one above!</div>';
            return;
        }

        tagsList.innerHTML = availableTags.map(tag => {
            const isPrivate = tag.visibility === 'private';
            const badge = isPrivate ? '🔑 Private' : '🌐 Public';
            const color = isPrivate ? '#f59e0b' : '#3b82f6';
            const borderStyle = '1px solid var(--clr-border, #cbd5e1)';
            const padding = '5px 10px';
            const borderRadius = '6px';
            const fontSize = '0.8rem';
            const cursor = 'pointer';
            
            return `
                <div class="tag-chip" data-id="${tag._id}" style="display: flex; align-items: center; gap: 6px; padding: ${padding}; border: ${borderStyle}; border-radius: ${borderRadius}; font-size: ${fontSize}; cursor: ${cursor}; background: var(--clr-bg-card, #ffffff); font-weight: 500; transition: all 0.15s; user-select: none;">
                    <span>${tag.name}</span>
                    <span style="font-size: 0.65rem; background: rgba(0,0,0,0.04); padding: 1px 4px; border-radius: 4px; color: ${color}; font-weight: 600;">${badge}</span>
                    <span class="delete-tag-btn" data-id="${tag._id}" style="font-size: 0.8rem; font-weight: 700; color: #ef4444; margin-left: 4px; padding: 0 2px; cursor: pointer;">&times;</span>
                </div>
            `;
        }).join('');

        // Attach tag deletion handlers
        document.querySelectorAll('.delete-tag-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const tagId = btn.dataset.id;
                if (!confirm('Are you sure you want to delete this custom tag?')) return;
                
                try {
                    const response = await fetch(`${apiBase}/tags/${tagId}`, { method: 'DELETE' });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.message || 'Failed to delete tag');
                    showToast('Tag deleted!', 'success');
                    selectedTagIds.delete(tagId);
                    fetchTags();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
        });
    }

    // Fetch official cands
    async function fetchOfficialCands() {
        try {
            const response = await fetch(`${apiBase}/admin-cands`);
            const data = await response.json();
            if (response.ok && data.cands) {
                officialCands = data.cands;
                officialCandsCount.textContent = `${officialCands.length} cand${officialCands.length !== 1 ? 's' : ''}`;
                renderOfficialCandsList();
            }
        } catch (err) {
            console.error('Error fetching official cands:', err);
        }
    }

    // Render official cands list
    function renderOfficialCandsList() {
        if (!officialCandsList) return;
        if (officialCands.length === 0) {
            officialCandsList.innerHTML = '<div style="font-size: 0.85rem; color: var(--clr-text-muted, #64748b); text-align: center; padding: 30px;">No official AI cands saved yet.</div>';
            return;
        }

        officialCandsList.innerHTML = officialCands.map((cand, index) => {
            const tagsChips = cand.tags.map(t => `<span style="font-size: 0.7rem; background: rgba(37,99,235,0.06); border: 1px solid rgba(37,99,235,0.15); padding: 2px 6px; border-radius: 4px; color: var(--clr-primary, #2563eb); font-weight: 500;">${t.name}</span>`).join(' ');
            const isAdmin = window.currentUserRole === 'admin';
            
            return `
                <div class="official-ai-cand-item" data-id="${cand._id}" data-tags="${cand.tags.map(t => t.name).join(' ')}" style="border: 1px solid var(--clr-border, #e2e8f0); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; background: var(--clr-bg-card, #ffffff); transition: all 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                        <p class="ai-cand-text" style="margin: 0; font-size: 0.85rem; line-height: 1.5; color: var(--clr-text-main, #1e293b); cursor: pointer;" title="Click to copy">${cand.text}</p>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <button class="copy-cand-btn" data-text="${cand.text.replace(/"/g, '&quot;')}" style="background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.2); color: #22c55e; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Copy</button>
                            <div style="display: flex; flex-direction: column; gap: 2px;">
                                <button class="move-up-btn" data-id="${cand._id}" style="border: none; background: rgba(0,0,0,0.04); font-size: 0.65rem; cursor: pointer; padding: 2px 4px; border-radius: 3px;">▲</button>
                                <button class="move-down-btn" data-id="${cand._id}" style="border: none; background: rgba(0,0,0,0.04); font-size: 0.65rem; cursor: pointer; padding: 2px 4px; border-radius: 3px;">▼</button>
                            </div>
                            ${isAdmin ? `
                                <button class="edit-cand-btn" data-id="${cand._id}" style="border: none; background: rgba(37,99,235,0.05); color: var(--clr-primary, #2563eb); font-size: 0.75rem; cursor: pointer; padding: 4px 6px; border-radius: 4px;">Edit</button>
                                <button class="delete-cand-btn" data-id="${cand._id}" style="border: none; background: rgba(239,68,68,0.05); color: #ef4444; font-size: 0.75rem; cursor: pointer; padding: 4px 6px; border-radius: 4px;">Delete</button>
                            ` : ''}
                        </div>
                    </div>
                    ${tagsChips ? `<div style="display: flex; flex-wrap: wrap; gap: 4px;">${tagsChips}</div>` : ''}
                </div>
            `;
        }).join('');

        // Attach list event handlers
        document.querySelectorAll('.copy-cand-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const text = btn.dataset.text;
                navigator.clipboard.writeText(text)
                    .then(() => showToast('Copied to clipboard!', 'success'))
                    .catch(() => showToast('Failed to copy', 'error'));
            });
        });

        // Click text to copy
        document.querySelectorAll('.official-ai-cand-item .ai-cand-text').forEach(p => {
            p.addEventListener('click', () => {
                navigator.clipboard.writeText(p.textContent)
                    .then(() => showToast('Copied to clipboard!', 'success'))
                    .catch(() => showToast('Failed to copy', 'error'));
            });
        });

        // Move Up
        document.querySelectorAll('.move-up-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const index = officialCands.findIndex(c => c._id === id);
                if (index > 0) {
                    const temp = officialCands[index];
                    officialCands[index] = officialCands[index - 1];
                    officialCands[index - 1] = temp;
                    renderOfficialCandsList();
                    saveNewSequence();
                }
            });
        });

        // Move Down
        document.querySelectorAll('.move-down-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const index = officialCands.findIndex(c => c._id === id);
                if (index > -1 && index < officialCands.length - 1) {
                    const temp = officialCands[index];
                    officialCands[index] = officialCands[index + 1];
                    officialCands[index + 1] = temp;
                    renderOfficialCandsList();
                    saveNewSequence();
                }
            });
        });

        // Edit Admin Cand
        document.querySelectorAll('.edit-cand-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const cand = officialCands.find(c => c._id === id);
                if (cand) {
                    currentEditCandId = id;
                    editCandText.value = cand.text;
                    renderEditModalTags(cand.tags.map(t => t._id));
                    editModal.style.display = 'flex';
                }
            });
        });

        // Delete Admin Cand
        document.querySelectorAll('.delete-cand-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (!confirm('Are you sure you want to delete this official canned response?')) return;

                try {
                    const response = await fetch(`${apiBase}/admin-cands/${id}`, { method: 'DELETE' });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.message || 'Failed to delete response');
                    showToast('Canned response deleted!', 'success');
                    fetchOfficialCands();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
        });
    }

    // Filter list search
    function filterCandsList(query) {
        const term = query.toLowerCase().trim();
        const items = document.querySelectorAll('.official-ai-cand-item');
        items.forEach(item => {
            const text = (item.querySelector('.ai-cand-text')?.textContent || '').toLowerCase();
            const tags = (item.dataset.tags || '').toLowerCase();
            const match = text.includes(term) || tags.includes(term);
            item.style.display = (!term || match) ? '' : 'none';
        });
    }

    // Save Reordered Sequence
    async function saveNewSequence() {
        const orderedIds = officialCands.map(c => c._id);
        try {
            await fetch(`${apiBase}/admin-cands/reorder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedIds })
            });
        } catch (err) {
            console.error('Failed to save reordered sequence:', err);
        }
    }

    // Load Prompt Template
    async function fetchPromptTemplate() {
        try {
            const response = await fetch(`${apiBase}/prompt`);
            const data = await response.json();
            if (response.ok && data.prompt) {
                adminPromptTextarea.value = data.prompt;
            }
        } catch (err) {
            console.error('Error fetching prompt template:', err);
        }
    }

    // Render Tags in Edit Modal
    function renderEditModalTags(checkedIds = []) {
        if (!editCandTagsList) return;
        editCandTagsList.innerHTML = availableTags.map(tag => {
            const checked = checkedIds.includes(tag._id) ? 'checked' : '';
            return `
                <label style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border: 1px solid var(--clr-border, #e2e8f0); border-radius: 6px; font-size: 0.8rem; cursor: pointer; background: var(--clr-bg-card, #ffffff);">
                    <input type="checkbox" class="edit-cand-tag-checkbox" value="${tag._id}" ${checked}>
                    <span>${tag.name}</span>
                </label>
            `;
        }).join('');
    }

    // Modal close events
    const closeModal = () => {
        editModal.style.display = 'none';
        currentEditCandId = null;
    };
    closeEditModal?.addEventListener('click', closeModal);
    cancelEditBtn?.addEventListener('click', closeModal);
    editModal?.addEventListener('click', (e) => {
        if (e.target === editModal) closeModal();
    });

    // Save edited cand
    saveEditBtn?.addEventListener('click', async () => {
        if (!currentEditCandId) return;
        const text = editCandText.value;
        const checkedCheckboxes = document.querySelectorAll('.edit-cand-tag-checkbox:checked');
        const tagIds = Array.from(checkedCheckboxes).map(cb => cb.value);

        if (!text.trim()) return showToast('Please enter text content', 'error');

        try {
            const response = await fetch(`${apiBase}/admin-cands/${currentEditCandId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, tagIds })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to update canned response');

            showToast('Canned response updated!', 'success');
            closeModal();
            fetchOfficialCands();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Toast Notification helper
    function showToast(message, type = 'success') {
        // Find existing toast container or create one
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        const bg = type === 'success' ? '#22c55e' : '#ef4444';
        toast.style.cssText = `background: ${bg}; color: white; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; box-shadow: 0 4px 12px rgba(0,0,0,0.15); opacity: 0; transform: translateY(20px); transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275); pointer-events: auto;`;
        toast.textContent = message;

        container.appendChild(toast);

        // Animate in
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        }, 10);

        // Animate out
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 250);
        }, 3000);
    }
});
