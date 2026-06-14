/* share.js — Export, Share via Gmail/Outlook/WhatsApp, Public Link */

async function exportData(format) {
    const q = buildQuery({
        format,
        sections: getSelectedSections()
    });

    if (format === 'xlsx') {
        window.location.href = `/performance/api/performance/export/xlsx${q}`;
        toast('Downloading Excel…', 'info');
    } else if (format === 'csv') {
        window.location.href = `/performance/api/performance/export/csv${q}`;
        toast('Downloading CSV…', 'info');
    } else if (format === 'pdf') {
        window.location.href = `/performance/api/performance/export/pdf${q}`;
        toast('Generating PDF report…', 'info');
    }
}

function getSelectedSections() {
    return ['attendance','performance','breaks','behavior','errors']
        .filter(s => document.getElementById(`exp_${s}`)?.checked)
        .join(',');
}

async function generatePublicLink() {
    const q = buildQuery({ sections: getSelectedSections() });
    try {
        const res = await api(`/api/performance/share/link${q}`, { method: 'POST' });
        if (res?.link) {
            const input = document.getElementById('publicLinkInput');
            const copyBtn = document.getElementById('copyLinkBtn');
            input.value = res.link;
            if (copyBtn) copyBtn.style.display = 'inline-flex';
            toast('View-only link generated (expires in 7 days)', 'success');
        } else {
            toast('Failed to generate link', 'error');
        }
    } catch {
        toast('Error generating link', 'error');
    }
}

function copyPublicLink() {
    const input = document.getElementById('publicLinkInput');
    if (input?.value) {
        navigator.clipboard.writeText(input.value)
            .then(() => toast('Link copied to clipboard!', 'success'))
            .catch(() => {
                input.select();
                document.execCommand('copy');
                toast('Link copied!', 'success');
            });
    }
}

async function shareVia(platform) {
    const q = buildQuery({ sections: getSelectedSections() });

    // First generate an export link
    let shareUrl = window.location.origin + `/performance/api/performance/export/xlsx${q}`;
    let shareText = `PulseTrack Attendance & Performance Report — ${window.APP.org}`;

    // Try to get a proper share link
    try {
        const res = await api(`/api/performance/share/link${q}`, { method: 'POST' });
        if (res?.link) shareUrl = res.link;
    } catch { /* use default */ }

    const encoded = encodeURIComponent(shareUrl);
    const textEncoded = encodeURIComponent(shareText);
    const bodyEncoded = encodeURIComponent(`${shareText}\n\n${shareUrl}`);

    const urls = {
        gmail:    `https://mail.google.com/mail/?view=cm&fs=1&su=${textEncoded}&body=${bodyEncoded}`,
        outlook:  `https://outlook.live.com/mail/0/deeplink/compose?subject=${textEncoded}&body=${bodyEncoded}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`
    };

    if (urls[platform]) {
        window.open(urls[platform], '_blank', 'noopener,noreferrer,width=700,height=600');
        toast(`Opening ${platform}…`, 'info');
    }
}

async function exportEmployeeData() {
    const empId = document.getElementById('empSelector')?.value;
    if (!empId) { toast('Please select an employee first', 'warning'); return; }

    const q = buildQuery({ userId: empId });
    window.location.href = `/performance/api/performance/export/xlsx${q}`;
    toast('Downloading employee data…', 'info');
}

/* ─────────────────────────────────────────────────────────
   NEW: SECURE ENCRYPTED PUBLIC API
   ───────────────────────────────────────────────────────── */
async function generateSecureApiLink() {
    const empId = document.getElementById('empSelector')?.value;
    if (!empId) { 
        toast('Please select an employee first', 'warning'); 
        return; 
    }

    const duration = document.getElementById('secureApiDuration')?.value || 60;
    const oneTime = document.getElementById('secureApiOneTime')?.checked || false;
    const filters = window.APP.filters || {};

    try {
        const res = await api('/api/performance/share/encrypted-api', {
            method: 'POST',
            body: JSON.stringify({
                userId: empId,
                duration,
                oneTime,
                filters
            })
        });
        
        if (res?.link) {
            const input = document.getElementById('secureApiLinkInput');
            const copyBtn = document.getElementById('copySecureLinkBtn');
            input.value = res.link;
            if (copyBtn) copyBtn.style.display = 'inline-flex';
            toast('Secure API sharing link generated successfully!', 'success');
        } else {
            toast('Failed to generate secure API link', 'error');
        }
    } catch (e) {
        toast('Error: ' + e.message, 'error');
    }
}

function copySecureApiLink() {
    const input = document.getElementById('secureApiLinkInput');
    if (input?.value) {
        navigator.clipboard.writeText(input.value)
            .then(() => toast('Secure API link copied to clipboard!', 'success'))
            .catch(() => {
                input.select();
                document.execCommand('copy');
                toast('Secure API link copied!', 'success');
            });
    }
}

/* ─────────────────────────────────────────────────────────
   NEW: SHARE AS IMAGE (png download using html2canvas)
   ───────────────────────────────────────────────────────── */
function shareAsImage() {
    const target = document.querySelector('.main-content') || document.body;
    
    toast('Generating image snapshot…', 'info');
    
    html2canvas(target, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#111827',
        scale: 2
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Employee_Report_${document.getElementById('empName')?.textContent?.trim().replace(/\s+/g, '_') || 'Profile'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast('Snapshot downloaded successfully!', 'success');
    }).catch(err => {
        console.error('html2canvas error:', err);
        toast('Failed to generate image snapshot', 'error');
    });
}
