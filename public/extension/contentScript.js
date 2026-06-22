// SupportHub Autocomplete - Content Script

let shadowHost = null;
let shadowRoot = null;
let autocompleteDropdown = null;
let activeTextarea = null;
let allTemplates = [];
let activeLob = 'zomato';
let extensionEnabledGlobal = true;
let mutationObserver = null;
let mutationTimeout = null;
let scrollListener = null;
let resizeListener = null;

let inlinePreview = null;
let currentPredictions = [];
let currentFrequent = [];
let activeSuggestionIndex = 0;
let customPercentageGlobal = "35%";
let templatesUsageGlobal = {};
const textareaTriggers = new Map();

// Sync data if on the SupportHub website (check DOM elements)
function checkForSync() {
    const syncEl = document.getElementById('supporthub-extension-sync-data');
    if (syncEl) {
        try {
            const lob = syncEl.dataset.userLob;
            const username = syncEl.dataset.userName;
            const categoriesData = JSON.parse(syncEl.dataset.templates || '[]');
            
            const templates = [];
            categoriesData.forEach(cat => {
                const list = cat.templates || [];
                list.forEach(tpl => {
                    templates.push({
                        id: tpl._id,
                        _id: tpl._id,
                        categoryTitle: cat.categoryTitle,
                        text: tpl.text,
                        tags: tpl.tags || [],
                        isAi: tpl.isAi || false
                    });
                });
            });

            chrome.storage.local.set({
                lob: lob,
                username: username,
                templates: templates,
                lastSyncAt: Date.now()
            }, () => {
                console.log(`[SupportHub Sync] Synced ${templates.length} templates for LOB: ${lob}`);
            });
        } catch (err) {
            console.error('[SupportHub Sync] Sync error:', err);
        }
    }
}

// Initialize content script
function init() {
    checkForSync();
    setTimeout(checkForSync, 1000);
    setTimeout(checkForSync, 3000);

    // Load initial settings
    chrome.storage.local.get(['extensionEnabled', 'lob', 'templates', 'customPercentage', 'templatesUsage'], (res) => {
        extensionEnabledGlobal = res.extensionEnabled !== false;
        if (res.lob) activeLob = res.lob.toLowerCase().trim();
        if (res.templates) allTemplates = res.templates;
        if (res.customPercentage) customPercentageGlobal = res.customPercentage;
        if (res.templatesUsage) templatesUsageGlobal = res.templatesUsage || {};

        if (extensionEnabledGlobal) {
            setupAutocompleteUI();
        }
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            if (changes.extensionEnabled) {
                const newValue = changes.extensionEnabled.newValue !== false;
                if (newValue !== extensionEnabledGlobal) {
                    extensionEnabledGlobal = newValue;
                    if (extensionEnabledGlobal) {
                        setupAutocompleteUI();
                    } else {
                        destroyAutocompleteUI();
                    }
                }
            }
            if (changes.lob) {
                activeLob = changes.lob.newValue.toLowerCase().trim();
            }
            if (changes.templates) {
                allTemplates = changes.templates.newValue || [];
            }
            if (changes.customPercentage) {
                customPercentageGlobal = changes.customPercentage.newValue || "35%";
            }
            if (changes.templatesUsage) {
                templatesUsageGlobal = changes.templatesUsage.newValue || {};
            }
        }
    });

    // Handle messages from the popup (e.g. Copy & Fill click)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.target === 'contentScript') {
            if (message.action === 'insert-text') {
                insertTextIntoActiveTextarea(message.text);
                sendResponse({ success: true });
            }
        }
    });

    // Listen for click clicks outside to dismiss autocomplete dropdowns
    document.addEventListener('mousedown', (e) => {
        if (!extensionEnabledGlobal || !shadowRoot || !autocompleteDropdown) return;
        const path = e.composedPath();
        const clickedInsideDropdown = path.some(el => el === autocompleteDropdown);
        const clickedTextarea = path.some(el => el === activeTextarea);
        
        if (autocompleteDropdown.classList.contains('visible') && !clickedInsideDropdown && !clickedTextarea) {
            hideAutocompleteDropdown();
        }
    });
}

// Setup and mount isolated Shadow DOM elements
function setupAutocompleteUI() {
    if (document.getElementById('supporthub-extension-root')) {
        return;
    }

    console.log('[SupportHub] Initializing Autocomplete Assistant in isolated Shadow DOM...');

    // Create Shadow Host
    shadowHost = document.createElement('div');
    shadowHost.id = 'supporthub-extension-root';
    document.body.appendChild(shadowHost);

    // Attach Open Shadow Root
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    // Append Web Accessible Stylesheet
    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = chrome.runtime.getURL('contentScript.css');
    shadowRoot.appendChild(styleLink);

    // Create Autocomplete Dropdown Panel
    autocompleteDropdown = document.createElement('div');
    autocompleteDropdown.id = 'supporthub-autocomplete-dropdown';
    autocompleteDropdown.className = 'sh-autocomplete-dropdown hidden';
    shadowRoot.appendChild(autocompleteDropdown);

    // Create Inline Preview element
    inlinePreview = document.createElement('span');
    inlinePreview.id = 'supporthub-inline-preview';
    inlinePreview.className = 'sh-inline-preview';
    shadowRoot.appendChild(inlinePreview);

    // Initial query scan run
    injectTriggerButtons();

    // Setup MutationObserver for zero-overhead DOM checks
    mutationObserver = new MutationObserver(() => {
        if (mutationTimeout) clearTimeout(mutationTimeout);
        mutationTimeout = setTimeout(injectTriggerButtons, 300);
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    // Setup Throttled Scroll/Resize reposition listeners
    let scrollTicking = false;
    scrollListener = () => {
        if (!scrollTicking) {
            window.requestAnimationFrame(() => {
                repositionAutocompleteDropdown();
                repositionInlinePreview();
                repositionAllTriggers();
                scrollTicking = false;
            });
            scrollTicking = true;
        }
    };

    resizeListener = () => {
        repositionAutocompleteDropdown();
        repositionInlinePreview();
        repositionAllTriggers();
    };

    window.addEventListener('scroll', scrollListener, { capture: true, passive: true });
    window.addEventListener('resize', resizeListener);
}

// Tear down and clean up autocomplete resources
function destroyAutocompleteUI() {
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }
    if (mutationTimeout) {
        clearTimeout(mutationTimeout);
        mutationTimeout = null;
    }
    if (scrollListener) {
        window.removeEventListener('scroll', scrollListener, true);
        scrollListener = null;
    }
    if (resizeListener) {
        window.removeEventListener('resize', resizeListener);
        resizeListener = null;
    }

    textareaTriggers.forEach((trigger) => {
        trigger.remove();
    });
    textareaTriggers.clear();

    if (inlinePreview) {
        inlinePreview.remove();
        inlinePreview = null;
    }

    if (shadowHost) {
        shadowHost.remove();
        shadowHost = null;
        shadowRoot = null;
        autocompleteDropdown = null;
    }
    activeTextarea = null;
    currentPredictions = [];
    console.log('[SupportHub] Autocomplete Assistant disabled.');
}

// Scrape page and bind autocomplete handlers to target textareas
function injectTriggerButtons() {
    if (!extensionEnabledGlobal || !shadowRoot) return;

    // Scan for any textarea or text input on the page
    const textareas = document.querySelectorAll(
        'textarea, input[type="text"], input:not([type])'
    );
    
    textareas.forEach(textarea => {
        if (textareaTriggers.has(textarea)) return; // already registered
        
        // Create floating indicator trigger button
        const trigger = document.createElement('button');
        trigger.className = 'sh-suggest-trigger-btn';
        trigger.innerHTML = '<span>💡</span>';
        trigger.type = 'button';
        trigger.title = 'SupportHub Autocomplete';
        
        shadowRoot.appendChild(trigger);
        
        // Clicking trigger button focuses the textarea and shows predictions immediately
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            textarea.focus();
            showAutocompleteFor(textarea);
        });

        // Add focus/input/keydown listeners to textarea for inline autocomplete
        textarea.addEventListener('focus', () => {
            activeTextarea = textarea;
            showAutocompleteFor(textarea);
        });

        textarea.addEventListener('input', () => {
            activeTextarea = textarea;
            showAutocompleteFor(textarea);
        });

        // Intercept Tab / Enter keypresses for smart autocompletion
        textarea.addEventListener('keydown', handleTextareaKeydown);

        // Send Custom sentence for training on blur/submission if it was edited
        textarea.addEventListener('blur', () => {
            handleTextareaBlur(textarea);
        });

        // Also watch submit/add button clicks to train AI
        const addBtn = textarea.parentElement ? textarea.parentElement.querySelector('button') : null;
        if (addBtn) {
          addBtn.addEventListener('click', () => {
            handleTextareaBlur(textarea);
          });
        }

        textareaTriggers.set(textarea, trigger);
    });

    repositionAllTriggers();
}

// Position triggers next to textareas
function repositionAllTriggers() {
    textareaTriggers.forEach((trigger, textarea) => {
        if (!document.contains(textarea)) {
            trigger.remove();
            textareaTriggers.delete(textarea);
            return;
        }

        const rect = textarea.getBoundingClientRect();
        
        if (rect.width === 0 || rect.height === 0 || rect.width < 80 || rect.height < 20) {
            trigger.style.display = 'none';
            return;
        }

        trigger.style.display = 'flex';

        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        // Position inside bottom-right corner of target textarea (8px offset)
        const triggerSize = 26;
        const top = rect.bottom + scrollTop - triggerSize - 8;
        const left = rect.right + scrollLeft - triggerSize - 8;

        trigger.style.top = `${top}px`;
        trigger.style.left = `${left}px`;
    });
}

// Match prefixes and tokens to find upcoming predictive completions
function getUpcomingPredictions(typedText, templates) {
    if (!typedText || !typedText.trim()) return [];
    
    const cleanTyped = typedText.trim().toLowerCase();
    const typedWords = cleanTyped.split(/\s+/);
    
    const matchedList = [];
    
    templates.forEach(tpl => {
      const cleanTpl = tpl.text.trim();
      const cleanTplLower = cleanTpl.toLowerCase();
      
      // 1. Prefix matches
      if (cleanTplLower.startsWith(cleanTyped)) {
        const suffix = cleanTpl.substring(cleanTyped.length);
        matchedList.push({
          fullText: cleanTpl,
          prefix: cleanTpl.substring(0, cleanTyped.length),
          suffix: suffix,
          matchType: 'prefix',
          isAi: tpl.isAi || false,
          score: 10 + cleanTyped.length
        });
      }
      // 2. Multi-token matches
      else {
        const matchesAllTokens = typedWords.every(word => cleanTplLower.includes(word));
        if (matchesAllTokens) {
          let lastWordIndex = -1;
          typedWords.forEach(word => {
            const idx = cleanTplLower.indexOf(word);
            if (idx > lastWordIndex) lastWordIndex = idx + word.length;
          });
          
          const suffix = lastWordIndex >= 0 ? cleanTpl.substring(lastWordIndex) : cleanTpl;
          matchedList.push({
            fullText: cleanTpl,
            prefix: cleanTpl.substring(0, lastWordIndex),
            suffix: suffix,
            matchType: 'token',
            isAi: tpl.isAi || false,
            score: 5 + typedWords.length
          });
        }
      }
    });

    // Sort by score desc, then length asc
    matchedList.sort((a, b) => b.score - a.score || a.fullText.length - b.fullText.length);

    // Deduplicate
    const seen = new Set();
    const unique = [];
    matchedList.forEach(item => {
      if (!seen.has(item.fullText)) {
        seen.add(item.fullText);
        unique.push(item);
      }
    });

    return unique.slice(0, 3); // Top 3 suggestions for inline popup
}

// Show autocomplete predictions dropdown relative to active textarea
function showAutocompleteFor(textarea) {
    if (!autocompleteDropdown) return;

    const textValue = textarea.value;
    if (!textValue || !textValue.trim()) {
        hideAutocompleteDropdown();
        return;
    }

    const numMatch = textValue.match(/\b\d+\b$/);
    currentPredictions = getUpcomingPredictions(textValue, allTemplates);

    if (numMatch) {
        const typedNum = numMatch[0];
        const customPct = customPercentageGlobal || "35%";
        const fullText = textValue.replace(new RegExp(typedNum + '$'), customPct);
        const prefix = textValue.substring(0, textValue.length - typedNum.length);
        
        currentPredictions.unshift({
            fullText: fullText,
            prefix: prefix,
            suffix: customPct,
            matchType: 'percentage',
            isAi: true,
            isCustomPercentage: true
        });
    }

    // Get the top frequently used cands
    const usedCands = allTemplates
        .filter(t => templatesUsageGlobal[t.text] > 0)
        .sort((a, b) => (templatesUsageGlobal[b.text] || 0) - (templatesUsageGlobal[a.text] || 0));

    if (usedCands.length < 3) {
        for (const tpl of allTemplates) {
            if (usedCands.length >= 3) break;
            if (!usedCands.some(u => u.text === tpl.text)) {
                usedCands.push(tpl);
            }
        }
    }
    currentFrequent = usedCands.slice(0, 3);

    if (currentPredictions.length === 0 && currentFrequent.length === 0) {
        hideAutocompleteDropdown();
        return;
    }

    activeSuggestionIndex = 0; // Reset active prediction index on render

    // Render Grammarly-style AI Assist block layout
    autocompleteDropdown.innerHTML = '';

    // Create AI Assist Header
    const header = document.createElement('div');
    header.className = 'sh-assist-header';
    header.innerHTML = `
        <span class="sh-assist-logo">💡 AI Assist</span>
        <span class="sh-assist-lob">${activeLob.toUpperCase()}</span>
    `;
    autocompleteDropdown.appendChild(header);

    // Section 1: AI Predictions
    const predictionsTitle = document.createElement('div');
    predictionsTitle.className = 'sh-assist-section-title';
    predictionsTitle.textContent = 'AI Predictions';
    autocompleteDropdown.appendChild(predictionsTitle);

    const predictionsContainer = document.createElement('div');
    predictionsContainer.className = 'sh-assist-section-content';
    autocompleteDropdown.appendChild(predictionsContainer);

    if (currentPredictions.length === 0) {
        predictionsContainer.innerHTML = '<div class="sh-empty-msg">No matching predictions...</div>';
    } else {
        currentPredictions.forEach((pred, index) => {
            const row = document.createElement('div');
            row.className = `sh-autocomplete-item ${pred.isCustomPercentage ? 'percentage-item' : ''} ${index === activeSuggestionIndex ? 'active' : ''}`;
            
            row.innerHTML = `
                <div>
                    <span class="matched-text">${escapeHtml(pred.prefix)}</span><span class="predicted-text">${escapeHtml(pred.suffix)}</span>
                </div>
                <span class="sh-autocomplete-hint" style="${index === activeSuggestionIndex ? '' : 'display: none;'}">[Tab] or [Enter] to complete</span>
            `;

            row.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                autocompleteWith(pred.fullText);
            });

            predictionsContainer.appendChild(row);
        });
    }

    // Section 2: Frequently Used
    const frequentTitle = document.createElement('div');
    frequentTitle.className = 'sh-assist-section-title';
    frequentTitle.textContent = 'Frequently Used';
    autocompleteDropdown.appendChild(frequentTitle);

    const frequentContainer = document.createElement('div');
    frequentContainer.className = 'sh-assist-section-content';
    autocompleteDropdown.appendChild(frequentContainer);

    if (currentFrequent.length === 0) {
        frequentContainer.innerHTML = '<div class="sh-empty-msg">No frequently used cands yet...</div>';
    } else {
        currentFrequent.forEach((tpl, idx) => {
            const absIndex = currentPredictions.length + idx;
            const row = document.createElement('div');
            row.className = `sh-autocomplete-item ${absIndex === activeSuggestionIndex ? 'active' : ''}`;
            
            row.innerHTML = `
                <div>${escapeHtml(tpl.text)}</div>
                <span class="sh-autocomplete-hint" style="${absIndex === activeSuggestionIndex ? '' : 'display: none;'}">[Tab] or [Enter] to complete</span>
            `;

            row.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                autocompleteWith(tpl.text);
            });

            frequentContainer.appendChild(row);
        });
    }

    // Update inline preview
    if (inlinePreview && activeTextarea) {
        let suffixText = '';
        const chosen = currentPredictions[activeSuggestionIndex];
        if (chosen) {
            if (chosen.suffix) {
                suffixText = chosen.suffix;
            }
        } else {
            const freqIdx = activeSuggestionIndex - currentPredictions.length;
            const tpl = currentFrequent[freqIdx];
            if (tpl) {
                const typedVal = activeTextarea.value.toLowerCase();
                const tplVal = tpl.text.toLowerCase();
                if (tplVal.startsWith(typedVal)) {
                    suffixText = tpl.text.substring(typedVal.length);
                }
            }
        }
        
        inlinePreview.textContent = suffixText;
        
        // Copy computed font styles from activeTextarea
        const computed = window.getComputedStyle(activeTextarea);
        const fontProps = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'lineHeight', 'letterSpacing', 'wordSpacing'];
        fontProps.forEach(prop => {
            inlinePreview.style[prop] = computed[prop];
        });
        
        repositionInlinePreview();
    }

    repositionAutocompleteDropdown();
    autocompleteDropdown.classList.remove('hidden');
    autocompleteDropdown.classList.add('visible');
}

function hideAutocompleteDropdown() {
    if (autocompleteDropdown) {
        autocompleteDropdown.classList.remove('visible');
        autocompleteDropdown.classList.add('hidden');
    }
    if (inlinePreview) {
        inlinePreview.textContent = '';
    }
    currentPredictions = [];
    currentFrequent = [];
}

// Reposition dropdown panel below active textarea/cursor position
function repositionAutocompleteDropdown() {
    if (!activeTextarea || !autocompleteDropdown) return;

    const rect = activeTextarea.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    const caretPos = activeTextarea.selectionStart || 0;
    let caretCoords = { top: 0, left: 0, height: 20 };
    try {
        caretCoords = getCaretCoordinates(activeTextarea, caretPos);
    } catch (e) {
        console.warn('Caret calculation failed:', e);
    }

    const blockHeight = autocompleteDropdown.offsetHeight || 180;
    const blockWidth = 320;

    // Position directly below the caret line
    let top = rect.top + scrollTop + caretCoords.top + (caretCoords.height || 20) + 4 - activeTextarea.scrollTop;
    let left = rect.left + scrollLeft + caretCoords.left - activeTextarea.scrollLeft;

    // Flip upwards if cut off by bottom viewport boundary
    if (top + blockHeight > window.innerHeight + scrollTop && rect.top + scrollTop + caretCoords.top - blockHeight > scrollTop) {
        top = rect.top + scrollTop + caretCoords.top - blockHeight - 4 - activeTextarea.scrollTop;
    }

    // Lock within horizontal limits
    if (left + blockWidth > window.innerWidth + scrollLeft) {
        left = window.innerWidth + scrollLeft - blockWidth - 15;
    }
    if (left < scrollLeft) left = scrollLeft + 10;

    autocompleteDropdown.style.top = `${top}px`;
    autocompleteDropdown.style.left = `${left}px`;
}

function updateInlinePreview() {
    if (!inlinePreview || !activeTextarea) return;
    
    let suffixText = '';
    const totalPredictions = currentPredictions.length;
    if (activeSuggestionIndex < totalPredictions) {
        const chosen = currentPredictions[activeSuggestionIndex];
        if (chosen && chosen.suffix) {
            suffixText = chosen.suffix;
        }
    } else {
        const freqIdx = activeSuggestionIndex - totalPredictions;
        const tpl = currentFrequent[freqIdx];
        if (tpl) {
            const typedVal = activeTextarea.value.toLowerCase();
            const tplVal = tpl.text.toLowerCase();
            if (tplVal.startsWith(typedVal)) {
                suffixText = tpl.text.substring(typedVal.length);
            }
        }
    }
    
    inlinePreview.textContent = suffixText;
    repositionInlinePreview();
}

function repositionInlinePreview() {
    if (!activeTextarea || !inlinePreview || !inlinePreview.textContent) return;

    const rect = activeTextarea.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    const caretPos = activeTextarea.selectionStart || 0;
    let caretCoords = { top: 0, left: 0 };
    try {
        caretCoords = getCaretCoordinates(activeTextarea, caretPos);
    } catch (e) {
        console.warn('Caret calculation failed:', e);
    }

    const top = rect.top + scrollTop + caretCoords.top - activeTextarea.scrollTop;
    const left = rect.left + scrollLeft + caretCoords.left - activeTextarea.scrollLeft;

    inlinePreview.style.top = `${top}px`;
    inlinePreview.style.left = `${left}px`;
}

// Helper to calculate caret (cursor) pixel coordinates inside textarea/input
function getCaretCoordinates(element, position) {
    const properties = [
        'direction',
        'boxSizing',
        'width',
        'height',
        'overflowX',
        'overflowY',
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',
        'borderStyle',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'fontStyle',
        'fontVariant',
        'fontWeight',
        'fontStretch',
        'fontSize',
        'fontSizeAdjust',
        'lineHeight',
        'fontFamily',
        'textAlign',
        'textTransform',
        'textIndent',
        'textDecoration',
        'letterSpacing',
        'wordSpacing'
    ];

    // Create mirror container
    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    if (element.nodeName !== 'INPUT') {
        div.style.wordWrap = 'break-word';
    }
    
    const computed = window.getComputedStyle(element);
    properties.forEach(prop => {
        div.style[prop] = computed[prop];
    });

    // Make sure mirror width matches actual element width
    div.style.width = `${element.clientWidth}px`;

    document.body.appendChild(div);

    div.textContent = element.value.substring(0, position);
    if (element.nodeName === 'INPUT') {
        div.textContent = div.textContent.replace(/\s/g, '\u00a0');
    }

    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.';
    div.appendChild(span);

    const coordinates = {
        top: span.offsetTop,
        left: span.offsetLeft,
        height: parseFloat(computed.lineHeight) || 20
    };

    document.body.removeChild(div);
    return coordinates;
}

// Insert selected prediction and trigger completion
function autocompleteWith(text) {
    if (!activeTextarea) return;

    activeTextarea.value = text;
    activeTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    activeTextarea.dispatchEvent(new Event('change', { bubbles: true }));

    // Increment template usage count
    templatesUsageGlobal[text] = (templatesUsageGlobal[text] || 0) + 1;
    chrome.storage.local.set({ templatesUsage: templatesUsageGlobal });

    // Confirmation glow animation
    activeTextarea.style.transition = 'background-color 0.25s ease';
    activeTextarea.style.backgroundColor = '#ecfdf5'; // Light green success
    setTimeout(() => {
        activeTextarea.style.backgroundColor = '';
    }, 400);

    hideAutocompleteDropdown();
}

function updateActiveDropdownItem() {
    if (!autocompleteDropdown) return;
    const items = autocompleteDropdown.querySelectorAll('.sh-autocomplete-item');
    items.forEach((item, index) => {
        if (index === activeSuggestionIndex) {
            item.classList.add('active');
            const hint = item.querySelector('.sh-autocomplete-hint');
            if (hint) hint.style.display = '';
        } else {
            item.classList.remove('active');
            const hint = item.querySelector('.sh-autocomplete-hint');
            if (hint) hint.style.display = 'none';
        }
    });
}

// Intercept keys inside target textareas/inputs
function handleTextareaKeydown(e) {
    if (autocompleteDropdown && autocompleteDropdown.classList.contains('visible')) {
        const totalItems = currentPredictions.length + currentFrequent.length;
        if (totalItems > 0) {
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                
                let chosenText = null;
                if (activeSuggestionIndex < currentPredictions.length) {
                    chosenText = currentPredictions[activeSuggestionIndex].fullText;
                } else {
                    const freqIdx = activeSuggestionIndex - currentPredictions.length;
                    if (currentFrequent[freqIdx]) {
                        chosenText = currentFrequent[freqIdx].text;
                    }
                }
                
                if (chosenText) {
                    autocompleteWith(chosenText);
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                activeSuggestionIndex = (activeSuggestionIndex + 1) % totalItems;
                updateActiveDropdownItem();
                updateInlinePreview();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                activeSuggestionIndex = (activeSuggestionIndex - 1 + totalItems) % totalItems;
                updateActiveDropdownItem();
                updateInlinePreview();
            } else if (e.key === 'Escape') {
                hideAutocompleteDropdown();
            }
        }
    }
}

// Insert text directly (used when clicking Copy & Fill inside popup window)
function insertTextIntoActiveTextarea(text) {
    // If no activeTextarea is tracked, find the first available visible one
    if (!activeTextarea || !document.contains(activeTextarea)) {
        activeTextarea = document.querySelector(
            'textarea, input[type="text"], input:not([type])'
        );
    }

    if (activeTextarea) {
        autocompleteWith(text);
        activeTextarea.focus();
    }
}

// Train model on custom sentences during user submission or blur events
async function handleTextareaBlur(textarea) {
    const textVal = textarea.value.trim();
    if (!textVal || textVal.length < 5) return;

    // Check if the typed sentence is different from any templates in database
    const matchesExisting = allTemplates.some(t => t.text.toLowerCase().trim() === textVal.toLowerCase());
    if (matchesExisting) return;

    // Submit sentence to backend training API
    chrome.storage.local.get(['hostUrl', 'lob'], async (res) => {
        const host = (res.hostUrl || 'http://localhost:3000').trim().replace(/\/$/, '');
        const lob = res.lob || activeLob;
        
        try {
            const trainRes = await fetch(`${host}/api/extension/train-sentence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sentence: textVal, lob: lob })
            });

            if (trainRes.ok) {
                const trainData = await trainRes.json();
                if (trainData.success && trainData.newlyTrained) {
                    console.log(`[AI Training] Custom sentence trained: "${textVal}"`);
                    
                    // Trigger beautiful purple glow animation on textarea to confirm AI model was trained
                    showAiTrainingIndicator(textarea);

                    // Add to local allTemplates array immediately to enable live predictions
                    const newTpl = {
                        id: 'trained_' + Date.now(),
                        _id: 'trained_' + Date.now(),
                        categoryTitle: 'Trained Predictions',
                        text: textVal,
                        tags: ['trained_prediction'],
                        isAi: true
                    };
                    allTemplates.push(newTpl);
                    chrome.storage.local.set({ templates: allTemplates });
                }
            }
        } catch (err) {
            console.warn('[AI Training] Sentence training connection error:', err);
        }
    });
}

// Flash textarea with a purple AI glow to confirm model training
function showAiTrainingIndicator(textarea) {
    const origTransition = textarea.style.transition;
    const origBorder = textarea.style.border;
    const origBoxShadow = textarea.style.boxShadow;
    
    textarea.style.transition = 'all 0.4s ease';
    textarea.style.border = '1px solid #818cf8'; 
    textarea.style.boxShadow = '0 0 10px rgba(129, 140, 248, 0.4)';
    
    setTimeout(() => {
        textarea.style.border = origBorder;
        textarea.style.boxShadow = origBoxShadow;
        textarea.style.transition = origTransition;
    }, 1500);
}

function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
}

// Run initializer
init();
