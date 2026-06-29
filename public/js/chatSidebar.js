document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('chat-sidebar-toggle');
    const closeBtn = document.getElementById('chat-sidebar-close');
    const clearBtn = document.getElementById('ai-chat-clear');
    const sidebar = document.getElementById('chat-sidebar');
    const tabBtns = document.querySelectorAll('.chat-tab-btn');
    const tabContents = document.querySelectorAll('.chat-tab-content');

    // Toggle Sidebar
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.add('open');
            const tooltip = document.getElementById('chat-levitating-tooltip');
            if (tooltip) tooltip.style.display = 'none';

            if (window.veronicaNeedsIntro) {
                playVeronicaIntro();
                window.veronicaNeedsIntro = false;
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            sidebar.classList.remove('open');
        });
    }

    // Tab Switching
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const target = document.getElementById('tab-' + btn.dataset.tab);
            if (target) {
                target.classList.add('active');
            }
        });
    });

    // AI Chat Logic
    const aiForm = document.getElementById('ai-chat-form');
    const aiInput = document.getElementById('ai-chat-input');
    const aiMessages = document.getElementById('ai-chat-messages');
    const aiSendBtn = document.getElementById('ai-chat-send');
    let replyingToText = null;

    let aiCurrentLimit = 50;
    let aiHasMoreMessages = true;
    let aiIsFetchingHistory = false;

    // Load History
    async function loadAiHistory(isPagination = false) {
        try {
            const res = await fetch(`/api/ai/history?limit=${aiCurrentLimit}`);
            if (res.ok) {
                const data = await res.json();
                if (data.messages && data.messages.length > 0) {
                    if (data.messages.length < aiCurrentLimit) {
                        aiHasMoreMessages = false;
                    } else {
                        aiHasMoreMessages = true;
                    }

                    const oldScrollHeight = aiMessages.scrollHeight;
                    aiMessages.innerHTML = '';
                    data.messages.forEach(msg => {
                        appendAiMessage(msg.content, msg.role === 'model' ? 'bot' : 'user', true); // Add true param to prevent scrolling on append if paginating
                    });

                    if (isPagination) {
                        requestAnimationFrame(() => {
                            aiMessages.scrollTop = aiMessages.scrollHeight - oldScrollHeight;
                        });
                    }
                } else {
                    aiHasMoreMessages = false;
                    if (!isPagination) {
                        window.veronicaNeedsIntro = true;
                        if (sidebar.classList.contains('open')) {
                            playVeronicaIntro();
                            window.veronicaNeedsIntro = false;
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load AI history', err);
        }
    }
    loadAiHistory();

    // AI Chat Scroll logic
    if (aiMessages) {
        aiMessages.addEventListener('scroll', () => {
            if (aiMessages.scrollTop === 0 && aiHasMoreMessages && !aiIsFetchingHistory) {
                aiIsFetchingHistory = true;
                aiCurrentLimit += 50;
                loadAiHistory(true).finally(() => {
                    aiIsFetchingHistory = false;
                });
            }
        });
    }
    // Clear History via DOM Modal
    const confirmModal = document.getElementById('chat-confirm-modal');
    const confirmCancelBtn = document.getElementById('chat-confirm-cancel');
    const confirmClearBtn = document.getElementById('chat-confirm-clear');

    if (clearBtn && confirmModal && confirmCancelBtn && confirmClearBtn) {
        clearBtn.addEventListener('click', () => {
            confirmModal.style.display = 'flex';
        });

        confirmCancelBtn.addEventListener('click', () => {
            confirmModal.style.display = 'none';
        });

        confirmClearBtn.addEventListener('click', async () => {
            confirmModal.style.display = 'none';
            
            const activeTabBtn = document.querySelector('.chat-tab-btn.active');
            if (!activeTabBtn) return;
            const tabName = activeTabBtn.dataset.tab;
            
            if (tabName === 'veronica') {
                try {
                    const res = await fetch('/api/ai/history', { method: 'DELETE' });
                    if (res.ok) {
                        aiMessages.innerHTML = '';
                        replyingToText = null;
                        updateReplyUI();
                        playVeronicaIntro();
                    }
                } catch (err) {
                    console.error('Failed to clear history', err);
                }
            } else if (tabName === 'groupchat') {
                if (typeof window.clearGroupChat === 'function') {
                    window.clearGroupChat();
                }
            }
        });
    }

    async function playVeronicaIntro() {
        if (window.veronicaIntroPlaying) return;
        window.veronicaIntroPlaying = true;
        aiMessages.innerHTML = '';
        const introMessages = [
            "Hi! I'm Veronica AI, your virtual assistant. 👋",
            "I'm here to help you with your day-to-day tasks. Need to **summarize a cand**, rephrase an email, or get answers? Just ask!",
            "**Pro Tip**: Users often use me to generate or refine prompts for cands. Just paste your draft and tell me what you need.",
            "Did you know? You can type `/` in the input box below to access **Speed Typing**. It works here and in the Group Chat!",
            "How can I assist you today?"
        ];

        for (const msg of introMessages) {
            await showTypingIndicator();
            appendAiMessage(msg, 'bot');
            aiMessages.scrollTop = aiMessages.scrollHeight;
            await new Promise(r => setTimeout(r, 600)); 
        }
        window.veronicaIntroPlaying = false;
    }

    function showTypingIndicator() {
        return new Promise(resolve => {
            const typingDiv = document.createElement('div');
            typingDiv.className = 'ai-msg bot typing-indicator';
            typingDiv.innerHTML = '<i class="fa fa-robot" style="margin-right: 8px; opacity: 0.8; font-size: 1.1em;"></i> <span class="dot"></span><span class="dot"></span><span class="dot"></span>';
            aiMessages.appendChild(typingDiv);
            aiMessages.scrollTop = aiMessages.scrollHeight;

            setTimeout(() => {
                typingDiv.remove();
                resolve();
            }, 1200);
        });
    }

    function appendAiMessage(text, role) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-msg ${role}`;
        
        let innerHtml = window.marked ? marked.parseInline(text) : text.replace(/\n/g, '<br>');
        
        let iconHtml = '';
        if (role === 'bot') {
            iconHtml = '<img src="/veronica.png" style="width:20px; height:20px; border-radius:50%; object-fit:cover; margin-right: 8px; vertical-align: middle;">';
        } else if (role === 'user') {
            const userAvatar = typeof window.currentUserProfilePic !== 'undefined' && window.currentUserProfilePic ? window.currentUserProfilePic : 'https://ui-avatars.com/api/?name=You&background=random';
            if (userAvatar.trim().startsWith('<')) {
                iconHtml = `<span style="display:inline-flex; width:20px; height:20px; border-radius:50%; overflow:hidden; align-items:center; justify-content:center; margin-right: 8px; vertical-align: middle;">${userAvatar}</span>`;
            } else {
                iconHtml = `<img src="${userAvatar}" style="width:20px; height:20px; border-radius:50%; object-fit:cover; margin-right: 8px; vertical-align: middle;">`;
            }
        }
        
        // Add Reply Button
        const replyBtn = document.createElement('button');
        replyBtn.innerHTML = '<i class="fa fa-reply"></i>';
        replyBtn.style.cssText = 'position:absolute; top:4px; right:4px; background:none; border:none; color:inherit; opacity:0.5; cursor:pointer; font-size:0.8rem;';
        replyBtn.title = 'Reply';
        replyBtn.addEventListener('click', () => {
            replyingToText = text.substring(0, 100) + (text.length > 100 ? '...' : '');
            updateReplyUI();
            aiInput.focus();
        });

        msgDiv.style.position = 'relative';
        msgDiv.innerHTML = iconHtml + innerHtml;
        msgDiv.appendChild(replyBtn);

        aiMessages.appendChild(msgDiv);
        aiMessages.scrollTop = aiMessages.scrollHeight;
    }

    function updateReplyUI() {
        let indicator = document.getElementById('ai-reply-indicator');
        if (replyingToText) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'ai-reply-indicator';
                indicator.style.cssText = 'background: rgba(255,255,255,0.1); padding: 4px 8px; font-size: 0.8rem; margin-bottom: 4px; border-radius: 4px; display:flex; justify-content:space-between;';
                aiForm.parentNode.insertBefore(indicator, aiForm);
            }
            indicator.innerHTML = `<span>Replying to: <i>${replyingToText}</i></span> <span style="cursor:pointer; font-weight:bold;" onclick="window.cancelReply()">&times;</span>`;
        } else {
            if (indicator) indicator.remove();
        }
    }

    window.cancelReply = function() {
        replyingToText = null;
        updateReplyUI();
    };

    if (aiForm) {
        aiForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const prompt = aiInput.value.trim();
            if (!prompt) return;

            // Optimistic UI
            const displayPrompt = replyingToText ? `[Replying: ${replyingToText}]\n${prompt}` : prompt;
            appendAiMessage(displayPrompt, 'user');
            
            const payload = { prompt, replyTo: replyingToText };
            replyingToText = null;
            updateReplyUI();
            
            aiInput.value = '';
            aiSendBtn.disabled = true;
            aiSendBtn.textContent = '...';

            try {
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                if (response.ok) {
                    appendAiMessage(data.reply, 'bot');
                } else {
                    appendAiMessage('Error: ' + (data.error || 'Failed to get response.'), 'bot');
                }
            } catch (err) {
                appendAiMessage('Error: Connection failed.', 'bot');
                console.error(err);
            } finally {
                aiSendBtn.disabled = false;
                aiSendBtn.textContent = 'Send';
            }
        });
    }
});