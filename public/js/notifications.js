// Client-side Notifications Logic
document.addEventListener('DOMContentLoaded', () => {
    const bellBtn = document.getElementById('global-notification-bell-btn');
    const dropdown = document.getElementById('global-notifications-dropdown');
    const badge = document.getElementById('global-notification-badge');
    const listContainer = document.getElementById('global-notifications-list');
    const markAllReadBtn = document.getElementById('btn-mark-all-read');

    if (!bellBtn || !dropdown || !badge || !listContainer) return;

    // Toggle dropdown
    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
        if (dropdown.classList.contains('active')) {
            fetchNotifications();
        }
    });

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    // Fetch and display notifications
    async function fetchNotifications() {
        try {
            const res = await fetch('/api/notifications');
            if (!res.ok) throw new Error('Failed to fetch notifications');
            const notifications = await res.json();

            renderNotifications(notifications);
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    // Expose globally so other modules (like briefings) can refresh notifications
    window.fetchNotifications = fetchNotifications;

    // Render list and update badge
    function renderNotifications(notifications) {
        // Count unread
        const unreadCount = notifications.filter(n => !n.isRead).length;

        // Update badge
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }

        // Handle empty state
        if (notifications.length === 0) {
            listContainer.innerHTML = `
                <div class="notifications-empty">
                    <div class="notifications-empty-icon">📭</div>
                    <div class="notifications-empty-text">All caught up!</div>
                </div>
            `;
            return;
        }

        // Icon mapping
        const icons = {
            username_change: '👤',
            password_change: '🔑',
            role_change: '🛡️',
            app_update: '🚀',
            sop_update: '📘',
            briefing: '🗓️',
            admin_broadcast: '📢',
            custom: '🔔'
        };

        // Render items
        listContainer.innerHTML = notifications.map(n => {
            const typeClass = `notif-${n.type || 'custom'}`;
            const unreadClass = n.isRead ? '' : 'unread';
            const icon = icons[n.type] || '🔔';
            const timeAgo = formatTimeAgo(new Date(n.createdAt));

            return `
                <div class="notification-item ${unreadClass}" data-id="${n._id}">
                    <div class="notification-icon-wrapper ${typeClass}">
                        ${icon}
                    </div>
                    <div class="notification-content">
                        <span class="notification-item-title">${escapeHTML(n.title)}</span>
                        <div class="notification-item-body">${compileContent(n.content, n.contentType)}</div>
                        <span class="notification-item-time">${timeAgo}</span>
                    </div>
                    ${n.isRead ? '' : '<div class="notification-unread-indicator"></div>'}
                </div>
            `;
        }).join('');

        // Attach read event listeners
        document.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', async () => {
                const id = item.dataset.id;
                if (item.classList.contains('unread')) {
                    item.classList.remove('unread');
                    const indicator = item.querySelector('.notification-unread-indicator');
                    if (indicator) indicator.remove();

                    // Call mark as read API
                    try {
                        const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
                        if (res.ok) {
                            // Update badge dynamically
                            const currentBadgeCount = parseInt(badge.textContent, 10) || 0;
                            if (currentBadgeCount > 1) {
                                badge.textContent = currentBadgeCount - 1;
                            } else {
                                badge.style.display = 'none';
                            }
                            // Animate and remove from DOM
                            item.style.opacity = '0';
                            item.style.transition = 'opacity 0.3s ease';
                            setTimeout(() => {
                                item.remove();
                                if (listContainer.children.length === 0) {
                                    listContainer.innerHTML = `
                                        <div class="notifications-empty">
                                            <div class="notifications-empty-icon">📭</div>
                                            <div class="notifications-empty-text">All caught up!</div>
                                        </div>
                                    `;
                                }
                            }, 300);
                        }
                    } catch (err) {
                        console.error('Failed to mark notification read:', err);
                    }
                }
            });
        });
    }

    // Mark all as read
    markAllReadBtn.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/notifications/read-all', { method: 'POST' });
            if (res.ok) {
                badge.style.display = 'none';
                fetchNotifications();
            }
        } catch (error) {
            console.error('Error marking all notifications read:', error);
        }
    });

    // Helper functions
    function formatTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        let interval = Math.floor(seconds / 31536000);

        if (interval >= 1) return `${interval}y ago`;
        interval = Math.floor(seconds / 2592000);
        if (interval >= 1) return `${interval}mo ago`;
        interval = Math.floor(seconds / 86400);
        if (interval >= 1) return `${interval}d ago`;
        interval = Math.floor(seconds / 3600);
        if (interval >= 1) return `${interval}h ago`;
        interval = Math.floor(seconds / 60);
        if (interval >= 1) return `${interval}m ago`;
        return 'just now';
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

    // Initial load
    fetchNotifications();

    // Poll for new notifications every 60 seconds
    setInterval(fetchNotifications, 60000);
});
