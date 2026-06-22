// SupportHub Autocomplete - Background Script

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'background') {
    if (message.action === 'manual-update-check') {
      checkAutoUpdate()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // async response
    }
  }
});

// Check for updates against local website server
async function checkAutoUpdate() {
  try {
    const storage = await chrome.storage.local.get(['hostUrl']);
    const host = (storage.hostUrl || 'http://localhost:3000').trim().replace(/\/$/, '');
    const version = chrome.runtime.getManifest().version;
    
    console.log(`[Auto-Update] Checking updates with version: ${version}`);
    const res = await fetch(`${host}/api/extension/check-update?version=${version}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.updated) {
        console.log(`[Auto-Update] Updated files downloaded on server. Reloading extension to version: ${data.newVersion}...`);
        setTimeout(() => {
          chrome.runtime.reload();
        }, 500);
        return { success: true, updated: true, newVersion: data.newVersion };
      }
      return { success: true, updated: false };
    }
    return { success: false, error: `Server returned status ${res.status}` };
  } catch (err) {
    console.warn('[Auto-Update] Update check failed:', err.message);
    return { success: false, error: err.message };
  }
}

// Background sync on cookie state modifications
async function triggerCookieSync() {
  try {
    const storage = await chrome.storage.local.get(['hostUrl', 'username']);
    const host = (storage.hostUrl || 'http://localhost:3000').trim().replace(/\/$/, '');
    
    const res = await fetch(`${host}/api/ping`, { credentials: 'include' });
    if (res.status === 200) {
      const data = await res.json().catch(() => ({}));
      const user = data.user;
      if (user) {
        // Trigger auto update check ONLY when user transitions from logged-out to logged-in
        if (!storage.username || storage.username !== user.username) {
          console.log(`[Auto-Update] New login detected for user: ${user.username}. Checking for updates...`);
          checkAutoUpdate();
        }
        const userLob = (user.department || 'zomato').toLowerCase().trim();
        
        // Fetch templates
        const tplRes = await fetch(`${host}/api/${userLob}/cands/templates`, { credentials: 'include' });
        if (tplRes.ok) {
          const tplData = await tplRes.json();
          if (tplData.success && tplData.categories) {
            const templates = [];
            tplData.categories.forEach(cat => {
              const list = cat.templates || [];
              list.forEach(tpl => {
                templates.push({
                  id: tpl._id,
                  _id: tpl._id,
                  categoryTitle: cat.title,
                  text: tpl.text,
                  tags: tpl.tags || [],
                  isAi: tpl.isAi || false
                });
              });
            });
            
            await chrome.storage.local.set({
              lob: userLob,
              username: user.username,
              templates: templates,
              lastSyncAt: Date.now()
            });
            console.log(`[Auto-Login] Synced ${templates.length} templates for user: ${user.username}`);
          }
        }
      }
    } else if (res.status === 401) {
      await chrome.storage.local.remove(['username', 'templates']);
      console.log('[Auto-Login] User logged out, cleared extension cache.');
    }
  } catch (err) {
    console.warn('[Auto-Login] Background sync failed:', err.message);
  }
}

// Lifecycle bindings
chrome.runtime.onInstalled.addListener(() => {
  triggerCookieSync();
});

chrome.runtime.onStartup.addListener(() => {
  triggerCookieSync();
});

// Watch cookie change for auto login/logout on the configured host domain
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  if (changeInfo.cookie.name !== 'connect.sid') return;

  const storage = await chrome.storage.local.get(['hostUrl']);
  const host = (storage.hostUrl || 'http://localhost:3000').trim();
  let domain = 'localhost';
  try {
    const url = new URL(host);
    domain = url.hostname;
  } catch (e) {}

  if (changeInfo.cookie.domain.includes(domain)) {
    console.log(`[Auto-Login] Detected session cookie change for domain ${domain}. Triggering sync...`);
    triggerCookieSync();
  }
});
