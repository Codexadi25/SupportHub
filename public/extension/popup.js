// SupportHub Autocomplete - Popup Script

const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'for', 'in', 'on', 'at', 'and', 'or', 'of', 'with', 'by', 'this', 'that', 'it', 'from', 'we', 'you', 'i', 'will', 'be', 'have', 'has']);

document.addEventListener('DOMContentLoaded', async () => {
  const hostUrlInput = document.getElementById('host-url');
  const statusContainer = document.getElementById('status-container');
  const statusText = document.getElementById('status-text');
  const errorContainer = document.getElementById('error-container');

  const extensionToggle = document.getElementById('extension-toggle');
  const extensionVersion = document.getElementById('extension-version');
  const updateMsg = document.getElementById('update-msg');
  const btnCheckUpdate = document.getElementById('btn-check-update');

  const lobSelect = document.getElementById('lob-select');
  const customPercentageInput = document.getElementById('custom-percentage');

  // New compose UI elements
  const composeBox = document.getElementById('compose-box');
  const predictionsList = document.getElementById('predictions-list');
  const btnCopyInsert = document.getElementById('btn-copy-insert');

  let allTemplates = [];
  let activeLob = 'zomato';
  let predictions = [];

  // Restore configuration
  const storage = await chrome.storage.local.get(['hostUrl', 'lob', 'username', 'templates', 'extensionEnabled', 'customPercentage']);
  if (storage.hostUrl) {
    hostUrlInput.value = storage.hostUrl;
  }
  if (storage.lob) {
    lobSelect.value = storage.lob;
    activeLob = storage.lob.toLowerCase().trim();
  }
  if (storage.templates) {
    allTemplates = storage.templates;
  }
  if (customPercentageInput) {
    customPercentageInput.value = storage.customPercentage || "35%";
  }

  // Restore suggestions toggle state
  const isSuggestionsEnabled = storage.extensionEnabled !== false; // default to true
  if (extensionToggle) {
    extensionToggle.checked = isSuggestionsEnabled;
  }

  if (storage.username) {
    statusContainer.className = 'status-bar status-active';
    statusText.textContent = `Connected LOB: ${activeLob.toUpperCase()} (${storage.username})`;
  } else {
    statusContainer.className = 'status-bar';
    statusText.textContent = 'Disconnected';
  }

  // Setup suggestions toggle handler
  if (extensionToggle) {
    extensionToggle.addEventListener('change', async () => {
      await chrome.storage.local.set({ extensionEnabled: extensionToggle.checked });
      console.log('[Popup] Inline suggestions toggle changed to:', extensionToggle.checked);
    });
  }

  // Setup custom percentage handler
  if (customPercentageInput) {
    customPercentageInput.addEventListener('input', async () => {
      const val = customPercentageInput.value.trim();
      await chrome.storage.local.set({ customPercentage: val });
      console.log('[Popup] Custom percentage changed to:', val);
    });
  }

  // Display version
  if (extensionVersion) {
    extensionVersion.textContent = chrome.runtime.getManifest().version;
  }

  // Live typing predictions handler
  if (composeBox) {
    composeBox.addEventListener('input', () => {
      const typedText = composeBox.value;
      updatePredictions(typedText);
    });

    // Support Tab or Enter key autocomplete
    composeBox.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (predictions.length > 0) {
          e.preventDefault();
          selectPrediction(predictions[0].fullText);
        }
      }
    });
  }

  // Select a suggestion card to complete compose box text
  function selectPrediction(text) {
    composeBox.value = text;
    updatePredictions(text);
    composeBox.focus();
  }

  // Match input prefixes and tokens against active template dataset
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

    return unique.slice(0, 5);
  }

  // Redraw predictions list
  function updatePredictions(typedText) {
    predictionsList.innerHTML = '';
    
    if (!typedText || !typedText.trim()) {
      predictionsList.innerHTML = '<div class="placeholder-text">Start typing to see predictions...</div>';
      btnCopyInsert.disabled = true;
      predictions = [];
      return;
    }

    btnCopyInsert.disabled = false;
    predictions = getUpcomingPredictions(typedText, allTemplates);

    if (predictions.length === 0) {
      predictionsList.innerHTML = `
        <div class="placeholder-text" style="padding-top: 15px; color: #4f46e5;">
          No matching predictions. <br>Submitting this will train the AI Model on your custom phrase.
        </div>`;
      return;
    }

    predictions.forEach((pred, index) => {
      const card = document.createElement('div');
      card.className = `prediction-item ${index === 0 ? 'active' : ''}`;
      
      const badge = pred.isAi ? '<span class="trained-badge">Trained</span>' : '';
      
      card.innerHTML = `
        ${badge}
        <span class="completed-part">${escapeHtml(pred.prefix)}</span><span class="predictive-part">${escapeHtml(pred.suffix)}</span>
      `;
      
      card.addEventListener('click', () => {
        selectPrediction(pred.fullText);
      });
      
      predictionsList.appendChild(card);
    });
  }

  // Copy text, inject into page, and trigger training if different from templates
  if (btnCopyInsert) {
    btnCopyInsert.addEventListener('click', async () => {
      const textToInsert = composeBox.value.trim();
      if (!textToInsert) return;

      errorContainer.textContent = '';
      btnCopyInsert.disabled = true;
      btnCopyInsert.textContent = '⏳ Copying & Filling...';

      // 1. Copy to clipboard
      navigator.clipboard.writeText(textToInsert).catch(err => {
        console.warn('[Popup] Clipboard write failed:', err);
      });

      // 2. Fill active tab's textarea
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          target: 'contentScript',
          action: 'insert-text',
          text: textToInsert
        }, (res) => {
          // Message response
        });
      }

      // 3. Train model on the custom sentence if it doesn't exist
      const isExisting = allTemplates.some(t => t.text.toLowerCase().trim() === textToInsert.toLowerCase());
      if (!isExisting) {
        const host = (hostUrlInput.value || 'http://localhost:3000').trim().replace(/\/$/, '');
        try {
          const trainRes = await fetch(`${host}/api/extension/train-sentence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sentence: textToInsert, lob: activeLob })
          });
          
          if (trainRes.ok) {
            const trainData = await trainRes.json();
            if (trainData.success && trainData.newlyTrained) {
              console.log('[Popup] Trained successfully, updating local cache...');
              
              // Append to local cache immediately
              const newTpl = {
                id: 'trained_' + Date.now(),
                _id: 'trained_' + Date.now(),
                categoryTitle: 'Trained Predictions',
                text: textToInsert,
                tags: ['trained_prediction'],
                isAi: true
              };
              allTemplates.push(newTpl);
              await chrome.storage.local.set({ templates: allTemplates });
              updatePredictions(textToInsert);
            }
          }
        } catch (err) {
          console.warn('[Popup] Sentence training connection error:', err);
        }
      }

      setTimeout(() => {
        btnCopyInsert.disabled = false;
        btnCopyInsert.textContent = '📋 Copy & Fill Active Textarea';
        composeBox.value = '';
        updatePredictions('');
      }, 800);
    });
  }

  // Check for Updates trigger
  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener('click', () => {
      btnCheckUpdate.disabled = true;
      btnCheckUpdate.textContent = '⏳ Checking...';
      if (updateMsg) {
        updateMsg.textContent = 'Checking...';
        updateMsg.style.color = '#64748b';
      }

      chrome.runtime.sendMessage({
        target: 'background',
        action: 'manual-update-check'
      }, (response) => {
        btnCheckUpdate.disabled = false;
        btnCheckUpdate.textContent = 'Check for Updates';

        if (chrome.runtime.lastError) {
          if (updateMsg) {
            updateMsg.textContent = 'Connection failed';
            updateMsg.style.color = '#ef4444';
          }
          return;
        }

        if (response && response.success) {
          if (response.updated) {
            if (updateMsg) {
              updateMsg.textContent = `New v${response.newVersion} installed!`;
              updateMsg.style.color = '#10b981';
            }
          } else {
            if (updateMsg) {
              updateMsg.textContent = 'Up to date';
              updateMsg.style.color = '#059669';
            }
          }
        } else {
          if (updateMsg) {
            updateMsg.textContent = (response && response.error) ? 'Failed: ' + response.error : 'Connection error';
            updateMsg.style.color = '#ef4444';
          }
        }
      });
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
