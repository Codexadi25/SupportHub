/**
 * Synchronizes SOP data and user's cache 
 *
 */
function syncSOPCache(data) {
    // Save to Local Storage for offline access
    localStorage.setItem('sop_cache_' + data.lob, JSON.stringify({
        updatedAt: new Date(),
        content: data.sops
    }));
    console.log("Cache Synchronized.");
}

// WebSocket Listener for real-time updates
socket.on('sop_update_published', (updatedData) => {
    // Alert the user and refresh cache
    if (confirm("New SOP version published. Update now?")) {
        syncSOPCache(updatedData);
        window.location.reload();
    }
});