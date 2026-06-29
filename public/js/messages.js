// Messages Panel JavaScript - Realtime Group Chat
document.addEventListener('DOMContentLoaded', () => {
    const messageListContainer = document.getElementById('message-list-container');
    const messageScrollArea = document.getElementById('message-scroll-area');
    const messageForm = document.getElementById('message-form');
    const searchInput = document.getElementById('message-search');
    
    let allMessages = [];
    let currentSearchTerm = '';
    let pollingInterval = null;
    let isUserScrolling = false;
    let currentLimit = 50;
    let hasMoreMessages = true;
    let isFetchingHistory = false;
    
    // Initialize
    loadMessages();
    setupEventListeners();
    
    // Polling for realtime updates
    pollingInterval = setInterval(() => {
        if (!isFetchingHistory) loadMessages();
    }, 3000);
    
    function setupEventListeners() {
        // Form submission
        messageForm?.addEventListener('submit', handleMessageSubmit);
        
        // Search
        searchInput?.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value.toLowerCase();
            renderMessages();
        });

        // Group Chat Replies
        messageListContainer?.addEventListener('click', (e) => {
            const replyBtn = e.target.closest('.gc-reply-btn');
            if (replyBtn) {
                const author = replyBtn.dataset.author;
                const input = document.getElementById('message-content');
                if (input && author) {
                    input.value = `@${author} ` + input.value;
                    input.focus();
                }
            }
            
            const replyAllBtn = e.target.closest('.gc-reply-all-btn');
            if (replyAllBtn) {
                const input = document.getElementById('message-content');
                if (input) {
                    input.value = `@All ` + input.value;
                    input.focus();
                }
            }
        });

        // Track scrolling to prevent auto-scroll if user is reading history
        if (messageScrollArea) {
            messageScrollArea.addEventListener('scroll', () => {
                if (messageScrollArea.scrollTop === 0 && hasMoreMessages && !isFetchingHistory) {
                    isFetchingHistory = true;
                    currentLimit += 50;
                    const oldScrollHeight = messageScrollArea.scrollHeight;
                    
                    loadMessages().then(() => {
                        requestAnimationFrame(() => {
                            if (messageScrollArea) {
                                messageScrollArea.scrollTop = messageScrollArea.scrollHeight - oldScrollHeight;
                            }
                            isFetchingHistory = false;
                        });
                    }).catch(() => { isFetchingHistory = false; });
                }
                
                const isAtBottom = messageScrollArea.scrollHeight - messageScrollArea.scrollTop <= messageScrollArea.clientHeight + 50;
                isUserScrolling = !isAtBottom;
            });
        }
    }
    
    // Expose clear function for chatSidebar.js
    window.clearGroupChat = async function() {
        try {
            const res = await fetch(`${basePath}/my`, { method: 'DELETE' });
            if (res.ok) {
                allMessages = [];
                currentLimit = 50;
                hasMoreMessages = true;
                renderMessages();
            }
        } catch (err) {
            console.error('Failed to clear group chat', err);
        }
    };
    
    // Get basePath based on URL
    let basePath = '/api/zomato/messages'; // default fallback
    const lobMatch = window.location.pathname.match(/\/sop\/[^\/]+\/([^\/]+)/);
    if (lobMatch) {
        basePath = `/api/${lobMatch[1]}/messages`;
    }
    
    async function loadMessages() {
        try {
            const response = await fetch(`${basePath}/my?limit=${currentLimit}`);
            if (!response.ok) throw new Error('Failed to load messages');
            
            const newMessages = await response.json();
            
            if (newMessages.length < currentLimit) {
                hasMoreMessages = false;
            } else {
                hasMoreMessages = true;
            }
            
            // Check for new messages to show in tooltip (only if not fetching history)
            if (!isFetchingHistory && allMessages.length > 0 && newMessages.length > allMessages.length) {
                const latestMsg = newMessages[newMessages.length - 1];
                const currentUserId = getCurrentUserId();
                if (String(latestMsg.authorId) !== String(currentUserId)) {
                    showTooltipForNewMessage(latestMsg);
                }
            }
            
            allMessages = newMessages;
            
            if (!isFetchingHistory) {
                renderMessages(false);
            } else {
                renderMessages(true); // true means preserve scroll conceptually, but we handle it manually above
            }
            
            updateNotificationCount();
        } catch (error) {
            console.error('Failed to load messages:', error);
            // Hide loading indicator if it exists and array is empty
            if (messageListContainer && allMessages.length === 0) {
                messageListContainer.innerHTML = '<div class="no-messages" style="text-align: center; color: rgba(255,255,255,0.5); padding: 20px;">Failed to load messages.</div>';
            }
        }
    }
    
    function showTooltipForNewMessage(message) {
        const sidebar = document.getElementById('chat-sidebar');
        if (sidebar && sidebar.classList.contains('open')) return;

        const tooltip = document.getElementById('chat-levitating-tooltip');
        if (tooltip) {
            let text = message.content || '';
            const isReplyAll = text.includes('@All ');
            
            let prefix = `${message.authorName}: `;
            if (isReplyAll) {
                prefix = `${message.authorName} replied all: `;
                text = text.replace('@All ', '');
            } else if (text.startsWith('@')) {
                // simple replace for other replies
                text = text.replace(/^@[^\s]+\s/, '');
            }
            
            let chunk = prefix + text;
            if (chunk.length > 16) {
                chunk = chunk.substring(0, 16) + '...';
            }
            
            tooltip.innerHTML = `${escapeHtml(chunk)}
                <div style="position: absolute; bottom: -6px; right: 20px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid white;"></div>`;
            tooltip.style.display = 'block';
        }
    }
    
    function renderMessages(forceScroll = false) {
        if (!messageListContainer) return;
        
        // Filter by search term
        const filteredMessages = allMessages.filter(msg => {
            if (!currentSearchTerm) return true;
            return (msg.content && msg.content.toLowerCase().includes(currentSearchTerm)) || 
                   (msg.authorName && msg.authorName.toLowerCase().includes(currentSearchTerm));
        });

        if (filteredMessages.length === 0) {
            messageListContainer.innerHTML = '<div class="no-messages" style="text-align: center; color: rgba(255,255,255,0.5); padding: 20px;">No messages found.</div>';
            return;
        }
        
        const currentUserId = getCurrentUserId();
        const isAdmin = window.currentUserRole === 'admin';
        
        messageListContainer.innerHTML = filteredMessages.map(message => {
            const isMine = String(message.authorId) === String(currentUserId);
            
            let messageContentHtml = '';
            
            if (message.isDeleted) {
                if (isAdmin) {
                    messageContentHtml = `
                        <div style="filter: blur(4px); opacity: 0.7; user-select: none;">${compileContent(message.content, message.contentType)}</div>
                        <div style="font-size: 11px; color: #ef4444; margin-top: 5px;">Deleted by ${escapeHtml(message.deletedBy || 'unknown')}</div>
                    `;
                } else {
                    messageContentHtml = `<div style="color: #94a3b8; font-style: italic;">🚫 This message was deleted.</div>`;
                }
            } else {
                messageContentHtml = compileContent(message.content, message.contentType);
            }
            
            const fallbackAvatarUrl = isMine ? 'https://ui-avatars.com/api/?name=You&background=random' : `https://ui-avatars.com/api/?name=${encodeURIComponent(message.authorName)}&background=random`;
            const avatarRaw = message.authorAvatar ? message.authorAvatar : fallbackAvatarUrl;
            
            let avatarHtml = '';
            if (avatarRaw.trim().startsWith('<')) {
                // The database stored an HTML snippet (like an <img> or <i> tag)
                avatarHtml = `<span style="display:inline-flex; width:16px; height:16px; border-radius:50%; overflow:hidden; align-items:center; justify-content:center; [&>img]:width:100%; [&>img]:height:100%; [&>img]:object-fit:cover;">${avatarRaw}</span>`;
            } else {
                // It's a plain URL
                avatarHtml = `<img src="${avatarRaw}" style="width:16px; height:16px; border-radius:50%; object-fit:cover;">`;
            }

            return `
                <div class="chat-bubble-container" style="display: flex; flex-direction: column; align-items: ${isMine ? 'flex-end' : 'flex-start'}; margin-bottom: 5px;" data-id="${message._id}">
                    <div style="font-size: 11px; color: #64748b; margin-bottom: 3px; margin-left: 5px; margin-right: 5px; display: flex; align-items: center; gap: 4px;">
                        ${avatarHtml}
                        ${isMine ? 'You' : escapeHtml(message.authorName)} • ${new Date(message.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                    
                    <div class="chat-bubble" style="
                        max-width: 75%;
                        padding: 10px 14px;
                        border-radius: 18px;
                        background: ${isMine ? 'var(--primary, #CB202D)' : '#f1f5f9'};
                        color: ${isMine ? '#ffffff' : '#333333'};
                        border-bottom-${isMine ? 'right' : 'left'}-radius: 4px;
                        position: relative;
                        word-break: break-word;
                    ">
                        ${messageContentHtml}
                        <div class="gc-reply-container" style="position: absolute; top: -12px; ${isMine ? 'left: -45px' : 'right: -45px'}; display: flex; gap: 4px;">
                            <button class="gc-reply-btn" data-author="${escapeHtml(message.authorName)}" title="Reply" style="background: white; border: 1px solid #cbd5e1; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; color: #334155; font-size: 16px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.15);">↩</button>
                            <button class="gc-reply-all-btn" title="Reply All" style="background: white; border: 1px solid #cbd5e1; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; color: #334155; font-size: 16px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.15);">⇈</button>
                        </div>
                    </div>
                    
                    <div class="chat-actions" style="display: flex; gap: 10px; margin-top: 3px; font-size: 11px;">
                        ${(!message.isDeleted && (isMine || isAdmin)) ? `<span class="delete-msg-btn" data-id="${message._id}" style="cursor: pointer; color: #94a3b8;">Delete</span>` : ''}
                        ${(message.isDeleted && isAdmin) ? `<span class="permanent-delete-msg-btn" data-id="${message._id}" style="cursor: pointer; color: #ef4444; font-weight: bold;">Permanently Delete</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // Add delete event listeners
        document.querySelectorAll('.delete-msg-btn').forEach(btn => {
            btn.addEventListener('click', handleDeleteMessage);
        });
        document.querySelectorAll('.permanent-delete-msg-btn').forEach(btn => {
            btn.addEventListener('click', handlePermanentDeleteMessage);
        });

        // Auto-scroll to bottom
        if (messageScrollArea && (!isUserScrolling || forceScroll)) {
            messageScrollArea.scrollTop = messageScrollArea.scrollHeight;
        }
    }
    
    function getCurrentUserId() {
        if (window.currentUserId) return window.currentUserId;
        const userElement = document.querySelector('[data-user-id]');
        if (userElement) return userElement.getAttribute('data-user-id');
        return null;
    }
    
    async function handleMessageSubmit(e) {
        e.preventDefault();
        
        const contentInput = document.getElementById('message-content');
        const content = contentInput.value.trim();
        if (!content) return;
        
        const data = {
            title: 'Chat Message',
            content: content,
            type: 'info',
            priority: 'medium',
            contentType: 'plain'
        };
        
        try {
            contentInput.disabled = true;
            const postResponse = await fetch(basePath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(data)
            });
            
            if (!postResponse.ok) {
                const error = await postResponse.json();
                throw new Error(error.message);
            }
            
            messageForm.reset();
            contentInput.disabled = false;
            contentInput.focus();
            
            await loadMessages();
            renderMessages(true); // force scroll down
        } catch (error) {
            contentInput.disabled = false;
            showToast('Error sending message: ' + error.message, 'error');
        }
    }

    async function handleDeleteMessage(e) {
        const messageId = e.target.dataset.id;
        if (!confirm('Delete this message for everyone?')) return;
        
        try {
            const response = await fetch(`${basePath}/${messageId}`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message);
            }
            await loadMessages();
        } catch (error) {
            showToast('Error deleting message: ' + error.message, 'error');
        }
    }

    async function handlePermanentDeleteMessage(e) {
        const messageId = e.target.dataset.id;
        if (!confirm('Permanently delete this message? It will be erased from the database.')) return;
        
        try {
            const response = await fetch(`${basePath}/${messageId}/permanent`, {
                method: 'DELETE',
                credentials: 'same-origin'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message);
            }
            await loadMessages();
        } catch (error) {
            showToast('Error permanently deleting message: ' + error.message, 'error');
        }
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    function compileContent(content, contentType) {
        if (!content) return '';
        if (contentType === 'html') {
            return content;
        } else if (contentType === 'markdown' && typeof marked !== 'undefined') {
            try {
                return marked.parse(content);
            } catch (e) {
                return linkifyText(escapeHtml(content)).replace(/\n/g, '<br>');
            }
        } else {
            return linkifyText(escapeHtml(content)).replace(/\n/g, '<br>');
        }
    }

    function linkifyText(text) {
        if (!text) return '';
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" style="text-decoration: underline;">$1</a>');
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
        
        // Count unread messages (ignore deleted for notif count)
        const unreadCount = allMessages.filter(message => {
            if (message.isDeleted) return false;
            const isRead = message.isRead && message.isRead.some(read => read.userId === currentUserId);
            return !isRead;
        }).length;
        
        if (unreadCount > 0) {
            notificationCount.textContent = unreadCount;
            notificationBell.style.display = 'inline-flex';
        } else {
            notificationBell.style.display = 'none';
        }
    }
});

