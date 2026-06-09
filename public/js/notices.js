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
                        <div class="cand-item" data-notice-id="${n._id}" data-content-type="${n.contentType || 'plain'}">
                            <div class="cand-header">
                                <span class="cand-category-label">${(n.type || 'info').toUpperCase()} • ${(n.priority || 'medium').toUpperCase()}</span>
                                ${controls}
                            </div>
                            <h4 class="pn-title">${n.title || 'Notice'}</h4>
                            <div class="cand-text" style="word-wrap:break-word;overflow-wrap:anywhere;margin-bottom:8px;">${compileContent(n.content, n.contentType)}</div>
                            <textarea style="display:none;" class="raw-content">${escapeHTML(n.content)}</textarea>
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
            <textarea id="noticeContent" name="content" rows="4" required maxlength="2000" placeholder="Your notice text (max 2000 chars)...">${existing?.content || ''}</textarea>
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
                <div class="form-group">
                    <label for="noticeContentType">Format</label>
                    <select id="noticeContentType" name="contentType">
                        <option value="plain" ${(!existing || existing?.contentType==='plain')?'selected':''}>Plain Text</option>
                        <option value="html" ${existing?.contentType==='html'?'selected':''}>HTML</option>
                        <option value="markdown" ${existing?.contentType==='markdown'?'selected':''}>Markdown</option>
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
                contentType: document.getElementById('noticeContentType').value,
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
                content: card.querySelector('.raw-content')?.value || '',
                contentType: card.dataset.contentType || 'plain'
            };
            openNoticeForm(existing);
        }
    });

    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function compileContent(content, contentType) {
        if (!content) return '';
        if (contentType === 'html') {
            return content;
        } else if (contentType === 'markdown' && typeof marked !== 'undefined') {
            try {
                return marked.parse(content);
            } catch (e) {
                console.error('Markdown parse error:', e);
                return linkifyText(escapeHTML(content)).replace(/\n/g, '<br>');
            }
        } else {
            return linkifyText(escapeHTML(content)).replace(/\n/g, '<br>');
        }
    }

    function linkifyText(text) {
        if (!text) return '';
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    }

    loadNotices();
});


