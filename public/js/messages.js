// Messages Panel JavaScript
document.addEventListener('DOMContentLoaded', () => {
    const messageListContainer = document.getElementById('message-list-container');
    const messageModal = document.getElementById('message-modal');
    const messageForm = document.getElementById('message-form');
    const createMessageBtn = document.getElementById('btn-create-message');
    const closeMessageModal = document.getElementById('close-message-modal');
    const cancelMessageBtn = document.getElementById('cancel-message');
    
    // Filter elements
    const typeFilter = document.getElementById('message-type-filter');
    const priorityFilter = document.getElementById('message-priority-filter');
    const clearFiltersBtn = document.getElementById('clear-message-filters');
    
    // Form elements
    const targetAllCheckbox = document.getElementById('target-all');
    const roleTargets = document.getElementById('role-targets');
    const specificUsersSelect = document.getElementById('message-specific-users');
    
    let allMessages = [];
    let allUsers = [];
    let currentFilters = {};
    
    // Initialize
    loadMessages();
    if (createMessageBtn) loadUsers(); // Only load users if admin
    setupEventListeners();
    updateNotificationCount(); // Update notification count on load
    
    function setupEventListeners() {
        // Modal controls
        createMessageBtn?.addEventListener('click', openMessageModal);
        closeMessageModal?.addEventListener('click', closeModal);
        cancelMessageBtn?.addEventListener('click', closeModal);
        messageModal?.addEventListener('click', (e) => {
            if (e.target === messageModal) closeModal();
        });
        
        // Form submission
        messageForm?.addEventListener('submit', handleMessageSubmit);
        
        // Target audience controls
        targetAllCheckbox?.addEventListener('change', handleTargetAllChange);
        
        // Filters
        typeFilter?.addEventListener('change', applyFilters);
        priorityFilter?.addEventListener('change', applyFilters);
        clearFiltersBtn?.addEventListener('click', clearFilters);
    }
    
    async function loadMessages() {
        try {
            showLoading();
            const response = await fetch('/api/messages/my');
            if (!response.ok) throw new Error('Failed to load messages');
            
            allMessages = await response.json();
            renderMessages(allMessages);
            updateNotificationCount(); // Update notification count after loading messages
        } catch (error) {
            showError('Failed to load messages: ' + error.message);
        }
    }
    
    async function loadUsers() {
        try {
            const response = await fetch('/api/messages/users');
            if (!response.ok) throw new Error('Failed to load users');
            
            allUsers = await response.json();
            populateUsersSelect();
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    }
    
    function populateUsersSelect() {
        if (!specificUsersSelect) return;
        
        specificUsersSelect.innerHTML = allUsers.map(user => 
            `<option value="${user._id}">${escapeHtml(user.username)} (${user.role})</option>`
        ).join('');
    }
    
    function renderMessages(messages) {
        if (!messageListContainer) return;
        
        if (messages.length === 0) {
            messageListContainer.innerHTML = '<div class="no-messages">No messages found.</div>';
            return;
        }
        
        messageListContainer.innerHTML = messages.map(message => {
            const isExpired = new Date(message.endDate) < new Date();
            const currentUserId = getCurrentUserId();
            const isRead = message.isRead && currentUserId && message.isRead.some(read => read.userId === currentUserId);
            const isUnread = !isRead && !isExpired;
            const isAdmin = window.currentUserRole === 'admin';
            
            return `
                <div class="message-item priority-${message.priority} ${isUnread ? 'unread' : ''}" data-id="${message._id}">
                    <div class="message-header">
                        <div class="message-meta">
                            <span class="message-type ${message.type}">${message.type}</span>
                            <span class="message-priority ${message.priority}">${message.priority}</span>
                        </div>
                        <div class="message-dates">
                            <div>Created: ${new Date(message.createdAt).toLocaleDateString()}</div>
                            <div class="message-expiry ${isExpired ? 'expired' : ''}">
                                Expires: ${new Date(message.endDate).toLocaleString()}
                            </div>
                        </div>
                    </div>
                    <div class="message-title">${escapeHtml(message.title)}</div>
                    <div class="message-content">${escapeHtml(message.content)}</div>
                    <div class="message-target-info">
                        Target: ${getTargetDescription(message)}
                    </div>
                    <div class="message-footer">
                        <div class="message-actions">
                            ${isUnread ? `
                                <button class="message-read-btn" data-id="${message._id}">
                                    Mark as Read
                                </button>
                            ` : ''}
                            <span class="message-read-ticks" title="${isRead ? 'Read' : 'Delivered'}">
                                ${isRead ? '✓✓' : '✓'}
                            </span>
                            ${isAdmin ? `
                                <button class="message-delete-btn danger" data-id="${message._id}">Delete</button>
                            ` : ''}
                        </div>
                        <div class="message-author">By ${escapeHtml(message.authorName)}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add read event listeners
        document.querySelectorAll('.message-read-btn').forEach(btn => {
            btn.addEventListener('click', handleMarkAsRead);
        });
        // Admin delete listeners
        document.querySelectorAll('.message-delete-btn').forEach(btn => {
            btn.addEventListener('click', handleDeleteMessage);
        });
    }
    
    function getTargetDescription(message) {
        if (message.targetRoles.includes('all')) {
            return 'All Users';
        }
        
        const roles = message.targetRoles.filter(role => role !== 'all');
        const userCount = message.targetUsers ? message.targetUsers.length : 0;
        
        let description = roles.length > 0 ? roles.join(', ') : '';
        if (userCount > 0) {
            description += (description ? ', ' : '') + `${userCount} specific user(s)`;
        }
        
        return description || 'No specific targets';
    }
    
    function getCurrentUserId() {
        // Get user ID from window object set by server
        if (window.currentUserId) {
            return window.currentUserId;
        }
        
        // Fallback: try to get from data attribute
        const userElement = document.querySelector('[data-user-id]');
        if (userElement) {
            return userElement.getAttribute('data-user-id');
        }
        
        // Last resort: return null and handle in the calling function
        return null;
    }
    
    function openMessageModal() {
        if (messageModal) {
            messageModal.style.display = 'flex';
            document.body.classList.add('modal-open');
            
            // Set default end date to 7 days from now
            const endDateInput = document.getElementById('message-end-date');
            if (endDateInput) {
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 7);
                endDateInput.value = futureDate.toISOString().slice(0, 16);
            }
        }
    }
    
    function closeModal() {
        if (messageModal) {
            messageModal.style.display = 'none';
            document.body.classList.remove('modal-open');
            messageForm?.reset();
            handleTargetAllChange(); // Reset target options
        }
    }
    
    function handleTargetAllChange() {
        if (!targetAllCheckbox || !roleTargets) return;
        
        const isChecked = targetAllCheckbox.checked;
        const roleCheckboxes = roleTargets.querySelectorAll('input[type="checkbox"]');
        
        roleCheckboxes.forEach(checkbox => {
            checkbox.disabled = isChecked;
            if (isChecked) {
                checkbox.checked = false;
            }
        });
        
        // Also disable specific users select when "All Users" is checked
        if (specificUsersSelect) {
            specificUsersSelect.disabled = isChecked;
            if (isChecked) {
                specificUsersSelect.selectedIndex = -1;
            }
        }
    }
    
    async function handleMessageSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(messageForm);
        const targetRoles = [];
        
        if (targetAllCheckbox?.checked) {
            targetRoles.push('all');
        } else {
            const roleCheckboxes = roleTargets?.querySelectorAll('input[type="checkbox"]:checked');
            roleCheckboxes?.forEach(checkbox => {
                targetRoles.push(checkbox.value);
            });
        }
        
        const targetUsers = specificUsersSelect?.disabled ? [] : 
            Array.from(specificUsersSelect?.selectedOptions || [])
                .map(option => option.value);
        
        const data = {
            title: formData.get('title'),
            content: formData.get('content'),
            type: formData.get('type'),
            priority: formData.get('priority'),
            endDate: formData.get('endDate'),
            targetRoles,
            targetUsers
        };
        
        try {
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message);
            }
            
            showToast('Message broadcasted successfully!', 'success');
            closeModal();
            loadMessages();
        } catch (error) {
            showToast('Error creating message: ' + error.message, 'error');
        }
    }
    
    async function handleMarkAsRead(e) {
        const messageId = e.target.dataset.id;
        const currentUserId = getCurrentUserId();
        
        if (!currentUserId) {
            showToast('Unable to identify user. Please refresh the page.', 'error');
            return;
        }
        
        try {
            const response = await fetch(`/api/messages/${messageId}/read`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message);
            }
            
            showToast('Message marked as read!', 'success');
            loadMessages(); // Reload to update UI
            updateNotificationCount(); // Update notification count
        } catch (error) {
            showToast('Error marking message as read: ' + error.message, 'error');
        }
    }

    async function handleDeleteMessage(e) {
        const messageId = e.target.dataset.id;
        if (!confirm('Delete this message? This cannot be undone.')) return;
        try {
            const response = await fetch(`/api/messages/${messageId}`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message);
            }
            showToast('Message deleted.', 'success');
            loadMessages();
        } catch (error) {
            showToast('Error deleting message: ' + error.message, 'error');
        }
    }
    
    function applyFilters() {
        currentFilters = {
            type: typeFilter?.value || '',
            priority: priorityFilter?.value || ''
        };
        
        const filtered = allMessages.filter(message => {
            return (!currentFilters.type || message.type === currentFilters.type) &&
                   (!currentFilters.priority || message.priority === currentFilters.priority);
        });
        
        renderMessages(filtered);
    }
    
    function clearFilters() {
        if (typeFilter) typeFilter.value = '';
        if (priorityFilter) priorityFilter.value = '';
        currentFilters = {};
        renderMessages(allMessages);
    }
    
    function showLoading() {
        if (messageListContainer) {
            messageListContainer.innerHTML = '<div class="loading-indicator">Loading messages...</div>';
        }
    }
    
    function showError(message) {
        if (messageListContainer) {
            messageListContainer.innerHTML = `<div class="no-messages">${escapeHtml(message)}</div>`;
        }
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.5s forwards';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }
    
    function updateNotificationCount() {
        const notificationBell = document.getElementById('message-notification-bell');
        const notificationCount = document.getElementById('unread-message-count');
        
        if (!notificationBell || !notificationCount) return;
        
        const currentUserId = getCurrentUserId();
        if (!currentUserId) return;
        
        // Count unread messages
        const unreadCount = allMessages.filter(message => {
            const isExpired = new Date(message.endDate) < new Date();
            const isRead = message.isRead && message.isRead.some(read => read.userId === currentUserId);
            return !isRead && !isExpired;
        }).length;
        
        if (unreadCount > 0) {
            notificationCount.textContent = unreadCount;
            notificationBell.style.display = 'inline-flex';
        } else {
            notificationBell.style.display = 'none';
        }
    }
});

