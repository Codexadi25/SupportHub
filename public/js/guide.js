/**
 * guide.js — SupportHub Feature Guide / Product Tour
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows a spotlight-based guided tour to users after a version update.
 * Remembers completion in localStorage — won't re-show for the same version.
 *
 * Public API (called from guide init at bottom of file):
 *   window.SHGuide.start()   — programmatically restart the guide
 *   window.SHGuide.reset()   — clear localStorage → guide will re-show on reload
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    // ── Constants ─────────────────────────────────────────────────────────────
    const LS_KEY      = 'sh_guide_seen_ver';   // localStorage key
    const PADDING     = 12;                     // px padding around spotlight target

    // ── Cursor SVG (hand pointer) ──────────────────────────────────────────────
    const CURSOR_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="40" height="52">
        <defs>
            <linearGradient id="cursorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stop-color="#2563eb"/>
                <stop offset="100%" stop-color="#6366f1"/>
            </linearGradient>
        </defs>
        <!-- Hand shadow -->
        <path d="M8 14 L8 36 Q8 46 18 46 L26 46 Q36 46 36 36 L36 24 Q36 20 32 20 L30 20 L30 18 Q30 14 26 14 L24 14 L24 12 Q24 8 20 8 L18 8 Q14 8 14 12 L14 14 Z"
              fill="rgba(37,99,235,0.15)" transform="translate(2,3)"/>
        <!-- Hand body -->
        <path d="M8 14 L8 36 Q8 46 18 46 L26 46 Q36 46 36 36 L36 24 Q36 20 32 20 L30 20 L30 18 Q30 14 26 14 L24 14 L24 12 Q24 8 20 8 L18 8 Q14 8 14 12 L14 14 Z"
              fill="url(#cursorGrad)"/>
        <!-- Finger highlight -->
        <path d="M16 13 Q16 10 19 10 Q22 10 22 13 L22 24" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <!-- Knuckle lines -->
        <line x1="14" y1="28" x2="36" y2="28" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-linecap="round"/>
    </svg>`;

    // ── Step definitions for v2.6.0 ───────────────────────────────────────────
    const STEPS = [
        {
            target    : '#chat-sidebar-toggle',
            emoji     : '💬',
            title     : 'New Floating Chat & AI',
            body      : 'The Messages tab has moved! Click here to access Group Chat and the brand new Veronica AI (powered by Vector Search).',
            position  : 'top',
            cursorPos : 'above-left',
        },
        {
            target    : '#top-bar-username-display',
            emoji     : '⚙️',
            title     : 'Font Size & Settings',
            body      : 'Click your name to open Profile Settings. You can scale the entire UI font — Small, Medium, Large, or Extra Large.',
            position  : 'bottom',
            cursorPos : 'below-left',
        },
        {
            target    : '#footer-version-link',
            emoji     : '📋',
            title     : 'Version History',
            body      : 'Click this badge at any time to open the full changelog to see all the new updates released after v2.5.1!',
            position  : 'top',
            cursorPos : 'above-right',
        },
    ];

    // ── State ─────────────────────────────────────────────────────────────────
    let currentStep  = 0;
    let spotlightEl  = null;
    let tooltipEl    = null;
    let cursorEl     = null;
    let cursorRingEl = null;
    let resizeTimer  = null;
    let latestVersion = null;

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** Clamp a value between min and max */
    function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

    /** Get padded bounding rect of a target element */
    function getBounds(el, pad) {
        const r = el.getBoundingClientRect();
        return {
            top   : r.top    - pad,
            left  : r.left   - pad,
            width : r.width  + pad * 2,
            height: r.height + pad * 2,
        };
    }

    /** Resolve a CSS selector to a DOM element — returns null if not found */
    function resolveTarget(selector) {
        const el = document.querySelector(selector);
        if (!el) return null;
        // Ensure it's visible
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return null;
        return el;
    }

    /** Scroll element into view smoothly if needed */
    function ensureVisible(el) {
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // ── DOM builders ──────────────────────────────────────────────────────────

    function createSpotlight() {
        const el = document.createElement('div');
        el.className = 'guide-spotlight-box';
        el.style.cssText = 'top:0;left:0;width:0;height:0;';
        document.body.appendChild(el);
        return el;
    }

    function createCursor() {
        const el = document.createElement('div');
        el.className = 'guide-cursor';
        el.innerHTML = CURSOR_SVG;
        document.body.appendChild(el);

        const ring = document.createElement('div');
        ring.className = 'guide-cursor-ring';
        document.body.appendChild(ring);

        return { el, ring };
    }

    function createTooltip() {
        const el = document.createElement('div');
        el.className = 'guide-tooltip';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', 'Feature guide step');
        el.innerHTML = `
            <div class="guide-tooltip-header">
                <span class="guide-tooltip-emoji"></span>
                <div style="flex:1">
                    <div class="guide-step-num"></div>
                    <p class="guide-tooltip-title"></p>
                </div>
            </div>
            <p class="guide-tooltip-body"></p>
            <div class="guide-progress"></div>
            <div class="guide-actions">
                <button class="guide-btn-skip" id="guide-skip-btn" aria-label="Skip guide">Skip tour</button>
                <button class="guide-btn-next" id="guide-next-btn" aria-label="Next step">
                    Next
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </button>
            </div>`;
        document.body.appendChild(el);
        return el;
    }

    // ── Position helpers ──────────────────────────────────────────────────────

    /** Position spotlight box over the target element */
    function positionSpotlight(targetEl) {
        const b = getBounds(targetEl, PADDING);
        spotlightEl.style.top    = b.top    + 'px';
        spotlightEl.style.left   = b.left   + 'px';
        spotlightEl.style.width  = b.width  + 'px';
        spotlightEl.style.height = b.height + 'px';
    }

    /** Position the animated cursor near the target */
    function positionCursor(targetEl, cursorPos) {
        const r = targetEl.getBoundingClientRect();
        const cw = 40, ch = 52;
        const rw = 52;
        let top, left, rtop, rleft;

        switch (cursorPos) {
            case 'below-right':
                top   = r.bottom + 6;
                left  = r.right  - cw + 4;
                rtop  = r.bottom + 6 + ch / 2;
                rleft = r.right  - cw + 4 + rw / 2;
                break;
            case 'below-left':
                top   = r.bottom + 6;
                left  = r.left   - 4;
                rtop  = r.bottom + 6 + ch / 2;
                rleft = r.left   - 4 + rw / 2;
                break;
            case 'above-right':
                top   = r.top   - ch - 8;
                left  = r.right - cw + 4;
                rtop  = r.top   - ch - 8 + ch / 2;
                rleft = r.right - cw + 4 + rw / 2;
                break;
            case 'above-left':
            default:
                top   = r.top  - ch - 8;
                left  = r.left - 4;
                rtop  = r.top  - ch - 8 + ch / 2;
                rleft = r.left - 4 + rw / 2;
        }

        // Clamp within viewport
        top   = clamp(top,   4, window.innerHeight - ch - 4);
        left  = clamp(left,  4, window.innerWidth  - cw - 4);
        rtop  = clamp(rtop,  4, window.innerHeight - 4);
        rleft = clamp(rleft, 4, window.innerWidth  - 4);

        cursorEl.style.top   = top  + 'px';
        cursorEl.style.left  = left + 'px';
        cursorRingEl.style.top  = rtop  + 'px';
        cursorRingEl.style.left = rleft + 'px';
    }

    /**
     * Position the tooltip relative to the target, trying the preferred position
     * first, then falling back to keep it fully on-screen.
     */
    function positionTooltip(targetEl, preferredPos) {
        const tgt = targetEl.getBoundingClientRect();
        const tw  = tooltipEl.offsetWidth  || 300;
        const th  = tooltipEl.offsetHeight || 160;
        const GAP = 14;
        const VW  = window.innerWidth;
        const VH  = window.innerHeight;

        const positions = {
            top   : { top: tgt.top  - th - GAP,       left: tgt.left + tgt.width  / 2 - tw / 2 },
            bottom: { top: tgt.bottom + GAP,           left: tgt.left + tgt.width  / 2 - tw / 2 },
            left  : { top: tgt.top  + tgt.height / 2 - th / 2, left: tgt.left - tw - GAP },
            right : { top: tgt.top  + tgt.height / 2 - th / 2, left: tgt.right + GAP },
        };

        const order = [preferredPos, 'bottom', 'top', 'right', 'left'];
        let chosen = preferredPos;

        for (const pos of order) {
            const p = positions[pos];
            if (
                p.top  >= 4      && p.top  + th <= VH - 4 &&
                p.left >= 4      && p.left + tw <= VW - 4
            ) { chosen = pos; break; }
        }

        let { top, left } = positions[chosen];
        top  = clamp(top,  4, VH - th - 4);
        left = clamp(left, 4, VW - tw - 4);

        tooltipEl.style.top  = top  + 'px';
        tooltipEl.style.left = left + 'px';
        tooltipEl.setAttribute('data-pos', chosen);
    }

    // ── Render step ───────────────────────────────────────────────────────────

    function renderStep(idx) {
        const step    = STEPS[idx];
        const targetEl = resolveTarget(step.target);

        if (!targetEl) {
            // Target not available — skip to next
            if (idx < STEPS.length - 1) renderStep(idx + 1);
            else finishGuide();
            return;
        }

        ensureVisible(targetEl);

        // Update tooltip content
        tooltipEl.querySelector('.guide-tooltip-emoji').textContent = step.emoji;
        tooltipEl.querySelector('.guide-step-num').textContent      = `Step ${idx + 1} of ${STEPS.length}`;
        tooltipEl.querySelector('.guide-tooltip-title').textContent = step.title;
        tooltipEl.querySelector('.guide-tooltip-body').textContent  = step.body;

        // Update next button label on last step
        const nextBtn = tooltipEl.querySelector('#guide-next-btn');
        if (idx === STEPS.length - 1) {
            nextBtn.innerHTML = `
                Done
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6L9 17l-5-5"/>
                </svg>`;
        } else {
            nextBtn.innerHTML = `
                Next
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>`;
        }

        // Update progress dots
        const dotsEl = tooltipEl.querySelector('.guide-progress');
        dotsEl.innerHTML = STEPS.map((_, i) =>
            `<span class="guide-dot ${i === idx ? 'active' : ''}" data-step="${i}" title="Step ${i+1}" tabindex="0" role="button" aria-label="Go to step ${i+1}"></span>`
        ).join('');

        // Dot click navigation
        dotsEl.querySelectorAll('.guide-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                currentStep = parseInt(dot.dataset.step, 10);
                renderStep(currentStep);
            });
        });

        // Wait one frame so tooltip has rendered its full size before positioning
        requestAnimationFrame(() => {
            positionSpotlight(targetEl);
            positionTooltip(targetEl, step.position);
            positionCursor(targetEl, step.cursorPos);
        });
    }

    // ── Tour lifecycle ────────────────────────────────────────────────────────

    function startTour() {
        // Remove welcome overlay if present
        const welcomeEl = document.getElementById('guide-welcome-overlay');
        if (welcomeEl) {
            welcomeEl.style.opacity = '0';
            welcomeEl.style.transition = 'opacity 0.25s';
            setTimeout(() => welcomeEl.remove(), 260);
        }

        currentStep = 0;

        // Build DOM
        spotlightEl = createSpotlight();
        const { el: ce, ring: re } = createCursor();
        cursorEl     = ce;
        cursorRingEl = re;
        tooltipEl    = createTooltip();

        // Hook buttons
        tooltipEl.querySelector('#guide-next-btn').addEventListener('click', advanceStep);
        tooltipEl.querySelector('#guide-skip-btn').addEventListener('click', skipGuide);

        // Keyboard support
        document.addEventListener('keydown', onKeyDown);

        // Reposition on resize
        window.addEventListener('resize', onResize);

        renderStep(0);
    }

    function advanceStep() {
        if (currentStep < STEPS.length - 1) {
            currentStep++;
            renderStep(currentStep);
        } else {
            finishGuide();
        }
    }

    function skipGuide() {
        teardown();
        markSeen();
    }

    function finishGuide() {
        teardown();
        markSeen();
        showFinishScreen();
    }

    function teardown() {
        document.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('resize', onResize);
        clearTimeout(resizeTimer);

        [spotlightEl, tooltipEl, cursorEl, cursorRingEl].forEach(el => {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        spotlightEl = tooltipEl = cursorEl = cursorRingEl = null;
    }

    function markSeen() {
        if (latestVersion) {
            try { localStorage.setItem(LS_KEY, latestVersion); } catch {}
        }
    }

    function onKeyDown(e) {
        if (e.key === 'Escape')   skipGuide();
        if (e.key === 'ArrowRight' || e.key === 'Enter') advanceStep();
        if (e.key === 'ArrowLeft' && currentStep > 0) {
            currentStep--;
            renderStep(currentStep);
        }
    }

    function onResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (spotlightEl) renderStep(currentStep);
        }, 120);
    }

    // ── Welcome screen ────────────────────────────────────────────────────────

    function showWelcomeScreen(version, changelog) {
        const featureItems = (changelog || [])
            .slice(0, 4)
            .map(line => {
                const text = String(line);
                // Extract emoji if present, else use default bullet
                const emojiMatch = text.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u);
                const emoji = emojiMatch ? emojiMatch[0] : '•';
                const clean = text.replace(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*/u, '').trim();
                return `<li><span>${emoji}</span><span>${_escGuide(clean)}</span></li>`;
            }).join('');

        const overlay = document.createElement('div');
        overlay.className = 'guide-welcome-overlay';
        overlay.id = 'guide-welcome-overlay';
        overlay.innerHTML = `
            <div class="guide-welcome-card" role="dialog" aria-modal="true" aria-label="What's new in SupportHub">
                <span class="guide-welcome-icon">🚀</span>
                <span class="guide-welcome-version-pill">What's new in ${_escGuide(version)}</span>
                <h2 class="guide-welcome-title">SupportHub just updated!</h2>
                <p class="guide-welcome-subtitle">
                    Here's a quick tour of what's new. It'll only take a minute.
                </p>
                ${featureItems ? `<ul class="guide-welcome-features">${featureItems}</ul>` : ''}
                <div class="guide-welcome-actions">
                    <button class="guide-btn-skip-welcome" id="guide-welcome-skip" aria-label="Skip tour">
                        Skip for now
                    </button>
                    <button class="guide-btn-start" id="guide-welcome-start" aria-label="Start tour">
                        🗺 Take the tour
                    </button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        document.getElementById('guide-welcome-start').addEventListener('click', startTour);
        document.getElementById('guide-welcome-skip').addEventListener('click', () => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.25s';
            setTimeout(() => overlay.remove(), 260);
            markSeen();
        });

        // Keyboard: Escape → skip, Enter → start
        overlay.addEventListener('keydown', e => {
            if (e.key === 'Escape') document.getElementById('guide-welcome-skip').click();
            if (e.key === 'Enter')  document.getElementById('guide-welcome-start').click();
        });
    }

    // ── Finish screen with confetti ───────────────────────────────────────────

    function showFinishScreen() {
        launchConfetti();

        const overlay = document.createElement('div');
        overlay.className = 'guide-finish-overlay';
        overlay.innerHTML = `
            <div class="guide-finish-card" role="dialog" aria-modal="true" aria-label="Tour complete">
                <span class="guide-finish-emoji">🎉</span>
                <h2 class="guide-finish-title">You're all caught up!</h2>
                <p class="guide-finish-body">
                    You now know everything that's new in this update.<br>
                    Click the version tag in the footer anytime to see the full changelog.
                </p>
                <button class="guide-btn-finish" id="guide-finish-btn" aria-label="Close tour">
                    Get started →
                </button>
            </div>`;

        document.body.appendChild(overlay);

        const closeFinish = () => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.25s';
            setTimeout(() => overlay.remove(), 260);
        };

        document.getElementById('guide-finish-btn').addEventListener('click', closeFinish);
        overlay.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') closeFinish(); });
        overlay.addEventListener('click', e => { if (e.target === overlay) closeFinish(); });
    }

    /** Launch colourful confetti particles */
    function launchConfetti() {
        const COLOURS = ['#2563eb', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];
        for (let i = 0; i < 55; i++) {
            setTimeout(() => {
                const el = document.createElement('div');
                el.className = 'guide-confetti';
                el.style.cssText = [
                    `left: ${Math.random() * 100}vw`,
                    `background: ${COLOURS[Math.floor(Math.random() * COLOURS.length)]}`,
                    `width:  ${4 + Math.random() * 7}px`,
                    `height: ${4 + Math.random() * 7}px`,
                    `border-radius: ${Math.random() > 0.5 ? '50%' : '2px'}`,
                    `animation-duration: ${1.2 + Math.random() * 1.8}s`,
                    `animation-delay: 0s`,
                ].join(';');
                document.body.appendChild(el);
                setTimeout(() => el.remove(), 3200);
            }, i * 35);
        }
    }

    // ── HTML escape ───────────────────────────────────────────────────────────
    function _escGuide(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Main entry point ──────────────────────────────────────────────────────

    /**
     * Check versionHistory.json. If the user hasn't seen the latest version,
     * show the welcome screen with the "What's new" tour.
     */
    function initGuide() {
        // Wait until DOM is fully interactive
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initGuide);
            return;
        }

        // Only show for logged-in users (app-wrapper exists = authenticated page)
        if (!document.querySelector('.app-wrapper')) return;

        // Add a small delay so the page finishes its own init animations first
        setTimeout(() => {
            fetch('/versionHistory.json', { cache: 'no-store' })
                .then(r => r.ok ? r.json() : [])
                .then(entries => {
                    if (!Array.isArray(entries) || !entries.length) return;

                    const latest = entries[0];
                    latestVersion = latest.version;

                    let seenVersion = null;
                    try { seenVersion = localStorage.getItem(LS_KEY); } catch {}

                    if (seenVersion === latestVersion) return; // Already seen

                    const displayLabel = latest.label || `v${latest.version}`;
                    showWelcomeScreen(displayLabel, latest.changelog || []);
                })
                .catch(() => {}); // Silently ignore fetch errors
        }, 900);
    }

    // ── Public API ─────────────────────────────────────────────────────────────
    window.SHGuide = {
        /** Force-restart the tour regardless of localStorage */
        start: function () {
            fetch('/versionHistory.json', { cache: 'no-store' })
                .then(r => r.ok ? r.json() : [])
                .then(entries => {
                    const latest = entries[0] || {};
                    latestVersion = latest.version || '?';
                    showWelcomeScreen(latest.label || `v${latestVersion}`, latest.changelog || []);
                })
                .catch(() => { showWelcomeScreen('SupportHub', []); });
        },
        /** Clear seen state — guide will appear again on next page load */
        reset: function () {
            try { localStorage.removeItem(LS_KEY); } catch {}
            console.log('[SHGuide] Guide state reset. Reload to see the welcome screen.');
        },
    };

    // ── Kick off ──────────────────────────────────────────────────────────────
    initGuide();

})();
