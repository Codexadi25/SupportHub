document.addEventListener('DOMContentLoaded', () => {
    const noticesList = document.getElementById('notices-list');
    const publishNoticeBtn = document.getElementById('btn-publish-notice');
    if (!noticesList) return; // page without notices

    async function loadNotices() {
        try {
            const notices = await window.apiRequest('/api/notices', 'GET');
            if (!Array.isArray(notices) || notices.length === 0) {
                noticesList.innerHTML = '<p class="small">No active notices.</p>';
                return;
            }
            const items = notices
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .map(n => {
                    const endStr = n.endDate ? new Date(n.endDate).toLocaleString() : '';
                    const canDelete = (window.currentUserRole === 'admin');
                    const canEdit = (window.currentUserRole === 'admin' || window.currentUserRole === 'team_lead');
                    const controls = (canDelete || canEdit) ? `
                        <div class="cand-actions">
                            ${canEdit ? `<button class="icon-btn btn-edit-notice" data-id="${n._id}" title="Edit">&#9998;</button>` : ''}
                            ${canDelete ? `<button class="icon-btn btn-delete-notice" data-id="${n._id}" title="Delete">&#128465;</button>` : ''}
                        </div>` : '';
                    return `
                        <div class="cand-item" data-notice-id="${n._id}">
                            <div class="cand-header">
                                <span class="cand-category-label">${(n.type || 'info').toUpperCase()} • ${(n.priority || 'medium').toUpperCase()}</span>
                                ${controls}
                            </div>
                            <h4 class="pn-title">${n.title || 'Notice'}</h4>
                            <pre class="cand-text" style="white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;">${n.content}</pre>
                            ${endStr ? `<p class="small" style="opacity:.7;">Valid until: ${endStr}</p>` : ''}
                        </div>`;
                })
                .join('');
            noticesList.innerHTML = items;
        } catch (err) {
            noticesList.innerHTML = '<p class="small">Failed to load notices.</p>';
        }
    }

    function openNoticeForm(existing = null) {
        const { modal, modalTitle, modalForm, openModal, closeModal } = window.__modal || {};
        if (!modal || !modalForm || !modalTitle) return;
        const isEdit = !!existing;
        modalTitle.textContent = isEdit ? 'Edit Notice' : 'Publish Notice';
        const defaultEnd = new Date(Date.now() + 24*60*60*1000).toISOString().slice(0,16);
        modalForm.innerHTML = `
            <label for="noticeTitle">Title *</label>
            <input id="noticeTitle" name="title" type="text" required maxlength="100" placeholder="Short notice title" value="${existing?.title || ''}">
            <label for="noticeContent">Content *</label>
            <textarea id="noticeContent" name="content" rows="4" required maxlength="300" placeholder="Your notice text (max 300 chars)...">${existing?.content || ''}</textarea>
            <div class="form-row">
                <div class="form-group">
                    <label for="noticeType">Type</label>
                    <select id="noticeType" name="type">
                        <option value="info" ${existing?.type==='info'?'selected':''}>Info</option>
                        <option value="announcement" ${existing?.type==='announcement'?'selected':''}>Announcement</option>
                        <option value="maintenance" ${existing?.type==='maintenance'?'selected':''}>Maintenance</option>
                        <option value="update" ${existing?.type==='update'?'selected':''}>Update</option>
                        <option value="warning" ${existing?.type==='warning'?'selected':''}>Warning</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="noticePriority">Priority</label>
                    <select id="noticePriority" name="priority">
                        <option value="low" ${existing?.priority==='low'?'selected':''}>Low</option>
                        <option value="medium" ${(!existing || existing?.priority==='medium')?'selected':''}>Medium</option>
                        <option value="high" ${existing?.priority==='high'?'selected':''}>High</option>
                        <option value="urgent" ${existing?.priority==='urgent'?'selected':''}>Urgent</option>
                    </select>
                </div>
            </div>
            <label for="noticeEnd">Visible Until</label>
            <input id="noticeEnd" name="endDate" type="datetime-local" value="${existing?.endDate ? new Date(existing.endDate).toISOString().slice(0,16) : defaultEnd}">
            <button type="submit" class="action-btn">${isEdit ? 'Save' : 'Publish'}</button>
        `;
        openModal();
        modalForm.onsubmit = async (ev) => {
            ev.preventDefault();
            const body = {
                title: document.getElementById('noticeTitle').value.trim(),
                content: document.getElementById('noticeContent').value.trim(),
                type: document.getElementById('noticeType').value,
                priority: document.getElementById('noticePriority').value,
                endDate: document.getElementById('noticeEnd').value
            };
            try {
                if (isEdit) {
                    await window.apiRequest(`/api/notices/${existing._id}`, 'PUT', body);
                } else {
                    await window.apiRequest('/api/notices', 'POST', body);
                }
                window.showToast(isEdit ? 'Notice saved' : 'Notice published', 'success');
                closeModal();
                loadNotices();
            } catch (e) {}
        };
    }

    publishNoticeBtn?.addEventListener('click', () => openNoticeForm());

    document.addEventListener('click', async (e) => {
        const del = e.target.closest('.btn-delete-notice');
        if (del) {
            const id = del.dataset.id;
            if (!id || !confirm('Delete this notice?')) return;
            try {
                await window.apiRequest(`/api/notices/${id}`, 'DELETE');
                window.showToast('Notice deleted', 'success');
                loadNotices();
            } catch (e) {}
            return;
        }
        const edit = e.target.closest('.btn-edit-notice');
        if (edit) {
            const id = edit.dataset.id;
            const card = edit.closest('[data-notice-id]');
            if (!id || !card) return;
            const existing = {
                _id: id,
                title: card.querySelector('.pn-title')?.textContent || '',
                content: card.querySelector('.cand-text')?.textContent || '',
                // type/priority are in header label; not essential to parse
            };
            openNoticeForm(existing);
        }
    });

    loadNotices();
});


