// Client-side Briefings & SOP Updates Logic
document.addEventListener('DOMContentLoaded', () => {
    // Form elements
    const toggleFormBtn = document.getElementById('btn-toggle-briefing-form');
    const formCard = document.getElementById('briefing-form-card');
    const briefingForm = document.getElementById('briefing-form');
    const cancelFormBtn = document.getElementById('btn-cancel-briefing');

    // List & filter elements
    const searchInput = document.getElementById('briefing-search');
    const filterButtons = document.querySelectorAll('.briefing-filter-btn');
    const listContainer = document.getElementById('briefings-list-container');

    // Badge counts
    const badgeCount = document.getElementById('briefings-count-badge');
    const countAll = document.getElementById('count-all-briefings');
    const countDaily = document.getElementById('count-daily-briefings');
    const countSop = document.getElementById('count-sop-updates');

    let allBriefings = [];
    let activeFilter = 'all';

    // Check if elements exist before proceeding
    if (!listContainer) return;

    // Toggle Form display
    if (toggleFormBtn && formCard) {
        toggleFormBtn.addEventListener('click', () => {
            formCard.classList.toggle('active');
            if (formCard.classList.contains('active')) {
                document.getElementById('briefing-title').focus();
            }
        });
    }

    if (cancelFormBtn && formCard) {
        cancelFormBtn.addEventListener('click', () => {
            formCard.classList.remove('active');
            briefingForm.reset();
        });
    }

    // Submit new briefing
    if (briefingForm) {
        briefingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('briefing-title').value.trim();
            const type = document.getElementById('briefing-type').value;
            const content = document.getElementById('briefing-content').value.trim();
            const contentType = document.getElementById('briefing-content-type').value;

            if (!title || !content) return;

            try {
                const response = await fetch('/api/briefings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, type, content, contentType })
                });
                
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || 'Failed to publish update');

                if (window.showToast) {
                    window.showToast('📢 Briefing published successfully!', 'success');
                } else {
                    alert('Briefing published successfully!');
                }

                // Reset and close form
                briefingForm.reset();
                formCard.classList.remove('active');

                // Reload notifications immediately since a new one was just sent
                if (window.fetchNotifications) {
                    window.fetchNotifications();
                }

                // Refresh briefings list
                fetchBriefings();
            } catch (error) {
                console.error('Error publishing briefing:', error);
                alert(error.message || 'Error publishing briefing');
            }
        });
    }

    // Filter switching
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.briefingType;
            renderFeed();
        });
    });

    // Search input handler
    if (searchInput) {
        searchInput.addEventListener('input', renderFeed);
    }

    // Fetch all briefings from API
    async function fetchBriefings() {
        try {
            const res = await fetch('/api/briefings');
            if (!res.ok) throw new Error('Failed to load briefings');
            allBriefings = await res.json();
            
            updateSidebarCounts();
            renderFeed();
        } catch (error) {
            console.error('Error fetching briefings:', error);
            listContainer.innerHTML = `<div class="briefing-empty-state"><div class="briefing-empty-state-text">Failed to load briefings feed</div></div>`;
        }
    }

    // Update sidebar counts badges
    function updateSidebarCounts() {
        const total = allBriefings.length;
        const dailyCount = allBriefings.filter(b => b.type === 'daily_briefing').length;
        const sopCount = allBriefings.filter(b => b.type === 'sop_update').length;

        if (badgeCount) badgeCount.textContent = total;
        if (countAll) countAll.textContent = total;
        if (countDaily) countDaily.textContent = dailyCount;
        if (countSop) countSop.textContent = sopCount;
    }

    // Render feed based on filters and search
    function renderFeed() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

        // Filter briefings
        let filtered = allBriefings;

        if (activeFilter !== 'all') {
            filtered = filtered.filter(b => b.type === activeFilter);
        }

        if (query) {
            filtered = filtered.filter(b => 
                b.title.toLowerCase().includes(query) || 
                b.content.toLowerCase().includes(query) || 
                b.authorName.toLowerCase().includes(query)
            );
        }

        // Empty state
        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="briefing-empty-state">
                    <div class="briefing-empty-state-icon">📭</div>
                    <div class="briefing-empty-state-text">No updates found</div>
                    <span style="font-size: 0.8rem; color: var(--text-muted, #64748b);">Try adjusting your filters or search query</span>
                </div>
            `;
            return;
        }

        // Render card lists
        listContainer.innerHTML = filtered.map(b => {
            const typeLabel = b.type === 'sop_update' ? 'SOP Update' : 'Daily Briefing';
            const dateStr = formatDateTime(new Date(b.createdAt));
            const firstChar = b.authorName.charAt(0).toUpperCase();
            
            // Check delete permission: admins, vendors, team leads, QAs, OR the author
            const canDelete = ['admin', 'vendor', 'team_lead', 'quality_analyst'].includes(window.currentUserRole) || 
                              String(b.authorId) === String(window.currentUserId);

            return `
                <div class="briefing-card" data-id="${b._id}">
                    <div class="briefing-card-header">
                        <div class="briefing-author-info">
                            <div class="briefing-author-avatar">${firstChar}</div>
                            <div class="briefing-author-meta">
                                <span class="briefing-author-name">${escapeHTML(b.authorName)}</span>
                                <span class="briefing-author-role">
                                    <span>${escapeHTML(b.authorRole)}</span>
                                </span>
                            </div>
                        </div>
                        <div class="briefing-meta-right">
                            <span class="briefing-type-badge ${b.type}">${typeLabel}</span>
                            <span class="briefing-card-time">${dateStr}</span>
                        </div>
                    </div>
                    <h4 class="briefing-card-title">${escapeHTML(b.title)}</h4>
                    <div class="briefing-card-body">${compileContent(b.content, b.contentType)}</div>
                    
                    ${canDelete ? `
                    <div class="briefing-card-actions">
                        <button class="briefing-delete-btn" data-id="${b._id}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Delete
                        </button>
                    </div>` : ''}
                </div>
            `;
        }).join('');

        // Attach delete listeners
        document.querySelectorAll('.briefing-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                
                if (!confirm('Are you sure you want to delete this briefing update? This action cannot be undone.')) return;

                try {
                    const res = await fetch(`/api/briefings/${id}`, { method: 'DELETE' });
                    const result = await res.json();
                    if (!res.ok) throw new Error(result.message || 'Failed to delete briefing');

                    if (window.showToast) {
                        window.showToast('Briefing deleted successfully.', 'success');
                    }
                    
                    fetchBriefings();
                } catch (error) {
                    console.error('Delete briefing error:', error);
                    alert(error.message || 'Error deleting briefing');
                }
            });
        });
    }

    // Helper functions
    function formatDateTime(date) {
        const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleDateString('en-US', options);
    }

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

    // Fetch on load
    fetchBriefings();

    // Export refresh method so other components can refresh the feed
    window.refreshBriefingsFeed = fetchBriefings;
});
