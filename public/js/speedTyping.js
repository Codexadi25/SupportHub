document.addEventListener('DOMContentLoaded', () => {
    // Shared Speed Typing Logic
    const popup = document.createElement('div');
    popup.id = 'speed-typing-popup';
    popup.style.cssText = `
        position: absolute;
        bottom: 100%;
        left: 0;
        width: 100%;
        max-height: 200px;
        overflow-y: auto;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
        display: none;
        z-index: 10001;
    `;
    
    // Default shortcuts
    let shortcuts = JSON.parse(localStorage.getItem('speedTypingShortcuts')) || [
        { shortcut: '/hello', text: 'Hello, how can I help you today?' },
        { shortcut: '/brb', text: 'I will be right back in a few minutes.' },
        { shortcut: '/done', text: 'I have completed the task successfully.' }
    ];

    let currentInput = null;
    let selectedIndex = 0;
    let currentMatches = [];

    function renderPopup(matches) {
        popup.innerHTML = '';
        currentMatches = matches;
        
        if (matches.length === 0) {
            popup.style.display = 'none';
            return;
        }

        matches.forEach((match, index) => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 10px;
                cursor: pointer;
                border-bottom: 1px solid #f1f5f9;
                background: ${index === selectedIndex ? '#f1f5f9' : 'white'};
            `;
            item.innerHTML = `<strong style="color: var(--primary, #CB202D);">${match.shortcut}</strong> - <span style="color:#64748b;">${match.text}</span>`;
            
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                insertText(match.text);
            });
            popup.appendChild(item);
        });
        
        popup.style.display = 'block';
    }

    function insertText(text) {
        if (!currentInput) return;
        const val = currentInput.value;
        const lastSlash = val.lastIndexOf('/');
        currentInput.value = val.substring(0, lastSlash) + text + " ";
        currentInput.dispatchEvent(new Event('input'));
        popup.style.display = 'none';
        currentInput.focus();
    }

    function setupInput(input) {
        input.parentElement.style.position = 'relative';
        
        // Auto-resize
        input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            
            // Speed typing detection
            const val = this.value;
            const lastSlashIndex = val.lastIndexOf('/');
            
            if (lastSlashIndex !== -1 && !val.substring(lastSlashIndex).includes(' ')) {
                currentInput = this;
                this.parentElement.appendChild(popup);
                const query = val.substring(lastSlashIndex).toLowerCase();
                const matches = shortcuts.filter(s => s.shortcut.toLowerCase().startsWith(query));
                selectedIndex = 0;
                renderPopup(matches);
            } else {
                popup.style.display = 'none';
            }
        });

        input.addEventListener('keydown', function(e) {
            if (popup.style.display === 'block') {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedIndex = (selectedIndex + 1) % currentMatches.length;
                    renderPopup(currentMatches);
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectedIndex = (selectedIndex - 1 + currentMatches.length) % currentMatches.length;
                    renderPopup(currentMatches);
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (currentMatches[selectedIndex]) {
                        insertText(currentMatches[selectedIndex].text);
                    }
                    return;
                }
            }

            // Enter to send, Ctrl+Enter for newline
            if (e.key === 'Enter') {
                if (e.ctrlKey || e.shiftKey) {
                    // Default behavior (new line)
                } else {
                    e.preventDefault();
                    const form = this.closest('form');
                    // Workaround to dispatch submit properly that triggers event listeners
                    if (form) {
                        const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
                        form.dispatchEvent(submitEvent);
                    }
                }
            }
        });
        
        input.addEventListener('blur', () => {
            // timeout to allow mousedown on popup items
            setTimeout(() => {
                popup.style.display = 'none';
            }, 100);
        });
    }

    // Attach to inputs
    const attachInputs = () => {
        document.querySelectorAll('.chat-input').forEach(input => {
            if (!input.dataset.speedSetup) {
                input.dataset.speedSetup = 'true';
                setupInput(input);
            }
        });
    };

    // Attach initially and observe for dynamic additions
    attachInputs();
    const observer = new MutationObserver(attachInputs);
    observer.observe(document.body, { childList: true, subtree: true });

    // --- Settings UI ---
    const settingsBtn = document.getElementById('ai-chat-settings');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            let modal = document.getElementById('speed-typing-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'speed-typing-modal';
                modal.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.5); z-index: 10002;
                    display: flex; align-items: center; justify-content: center;
                `;
                
                modal.innerHTML = `
                    <div style="background: white; padding: 20px; border-radius: 12px; width: 400px; max-width: 90%;">
                        <h3 style="margin-bottom: 15px;">Speed Typing Settings</h3>
                        <div id="st-list" style="max-height: 300px; overflow-y: auto; margin-bottom: 15px;"></div>
                        <div style="display:flex; gap:10px; margin-bottom: 15px;">
                            <input type="text" id="st-new-shortcut" placeholder="/shortcut" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
                            <input type="text" id="st-new-text" placeholder="Message text" style="flex:2; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
                            <button id="st-add-btn" style="padding:8px 12px; background:var(--primary,#CB202D); color:white; border:none; border-radius:4px; cursor:pointer;">Add</button>
                        </div>
                        <div style="text-align: right;">
                            <button id="st-close-btn" style="padding:8px 16px; background:#f1f5f9; color:#333; border:none; border-radius:4px; cursor:pointer;">Close</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);

                const renderList = () => {
                    const list = document.getElementById('st-list');
                    list.innerHTML = shortcuts.map((s, i) => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #f1f5f9;">
                            <div><strong>${s.shortcut}</strong><br><small style="color:#64748b;">${s.text}</small></div>
                            <button onclick="window.deleteShortcut(${i})" style="color:white; background:#ef4444; border:none; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-weight:bold; font-size:14px; line-height:1;" title="Remove shortcut">&times;</button>
                        </div>
                    `).join('');
                };

                window.deleteShortcut = (idx) => {
                    shortcuts.splice(idx, 1);
                    localStorage.setItem('speedTypingShortcuts', JSON.stringify(shortcuts));
                    renderList();
                };

                document.getElementById('st-add-btn').addEventListener('click', () => {
                    const s = document.getElementById('st-new-shortcut').value.trim();
                    const t = document.getElementById('st-new-text').value.trim();
                    if (s && t) {
                        shortcuts.push({ shortcut: s.startsWith('/') ? s : '/' + s, text: t });
                        localStorage.setItem('speedTypingShortcuts', JSON.stringify(shortcuts));
                        document.getElementById('st-new-shortcut').value = '';
                        document.getElementById('st-new-text').value = '';
                        renderList();
                    }
                });

                document.getElementById('st-close-btn').addEventListener('click', () => {
                    modal.style.display = 'none';
                });

                renderList();
            } else {
                modal.style.display = 'flex';
            }
        });
    }
});
