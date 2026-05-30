#!/usr/bin/env node
/**
 * updateVersionHistory.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs after every GitHub push (via Actions) to:
 *  1. Read the latest Git commit metadata
 *  2. Parse CHANGELOG.md to extract release notes for the new version
 *  3. Bump the patch version in package.json
 *  4. Prepend a structured entry (with changelog[]) into public/versionHistory.json
 *  5. POST a broadcast-update notification to the live app API so all users
 *     receive an in-app message about the new release
 *
 * Local usage:
 *   node scripts/updateVersionHistory.js
 *
 * CI usage (GitHub Actions sets env vars):
 *   APP_URL=https://your-app.example.com DEPLOY_SECRET=xxx LOB=zomato
 *   node scripts/updateVersionHistory.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { execSync } = require('child_process');
const fs           = require('fs');
const path         = require('path');
const https        = require('https');
const http         = require('http');

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT        = path.resolve(__dirname, '..');
const PKG_PATH    = path.join(ROOT, 'package.json');
const HIST_PATH   = path.join(ROOT, 'public', 'versionHistory.json');
const CHLOG_PATH  = path.join(ROOT, 'CHANGELOG.md');
const MAX_ENTRIES = 50;

// ── Environment ───────────────────────────────────────────────────────────────
const APP_URL      = process.env.APP_URL      || '';          // e.g. https://myapp.com
const DEPLOY_SECRET= process.env.DEPLOY_SECRET || '';         // must match server env
const LOB          = (process.env.LOB || 'zomato').toLowerCase();

// ── Helpers ──────────────────────────────────────────────────────────────────
function runGit(cmd) {
    try {
        return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
        return null;
    }
}

function bumpPatch(version) {
    const parts = String(version).split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return '2.5.1';
    parts[2] += 1;
    return parts.join('.');
}

/**
 * Parse CHANGELOG.md and extract bullet-point lines under the first ## heading.
 * Returns an array of clean strings.
 */
function parseChangelog(targetVersion) {
    if (!fs.existsSync(CHLOG_PATH)) return [];
    const md = fs.readFileSync(CHLOG_PATH, 'utf8');
    const lines = md.split('\n');

    let inSection = false;
    const bullets = [];

    for (const line of lines) {
        // Detect version headings like: ## [2.5.0] — 2026-05-30
        if (/^##\s+\[/.test(line)) {
            if (inSection) break; // Past our section — stop
            if (targetVersion && line.includes(`[${targetVersion}]`)) {
                inSection = true;
                continue;
            }
            // If no targetVersion, take the first section
            if (!targetVersion) {
                inSection = true;
                continue;
            }
        }

        if (inSection) {
            const stripped = line.replace(/^[-*•]\s+/, '').trim();
            if (stripped && !stripped.startsWith('#') && !stripped.startsWith('###')) {
                bullets.push(stripped);
            }
        }
    }

    return bullets;
}

/**
 * Fire-and-forget HTTP/S POST to broadcast the update notification.
 */
function broadcastUpdate(version, changelog) {
    if (!APP_URL || !DEPLOY_SECRET) {
        console.log('[updateVersionHistory] Skipping broadcast (APP_URL or DEPLOY_SECRET not set)');
        return;
    }

    const body = JSON.stringify({ version, changelog, secret: DEPLOY_SECRET });
    const url  = `${APP_URL}/api/${LOB}/messages/broadcast-update`;

    console.log(`[updateVersionHistory] Broadcasting update to ${url}`);

    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
        hostname: parsedUrl.hostname,
        port    : parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path    : parsedUrl.pathname,
        method  : 'POST',
        headers : {
            'Content-Type'  : 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    };

    const req = transport.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode === 201) {
                console.log(`[updateVersionHistory] ✅ Broadcast sent — status ${res.statusCode}`);
            } else {
                console.warn(`[updateVersionHistory] ⚠️  Broadcast returned ${res.statusCode}: ${data}`);
            }
        });
    });

    req.on('error', (err) => {
        console.warn('[updateVersionHistory] ⚠️  Broadcast failed (non-critical):', err.message);
    });

    req.write(body);
    req.end();
}

// ── Main ─────────────────────────────────────────────────────────────────────
(function main() {
    // 1. Read package.json
    let pkg;
    try {
        pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    } catch (err) {
        console.error('[updateVersionHistory] Cannot read package.json:', err.message);
        process.exit(1);
    }

    // 2. Git metadata for the latest commit
    const hash     = runGit('rev-parse --short HEAD')       || 'unknown';
    const fullHash = runGit('rev-parse HEAD')               || 'unknown';
    const author   = runGit('log -1 --pretty=format:%an')  || 'Unknown Author';
    const email    = runGit('log -1 --pretty=format:%ae')  || '';
    const date     = runGit('log -1 --pretty=format:%aI')  || new Date().toISOString();
    const message  = runGit('log -1 --pretty=format:%s')   || 'Update';
    const branch   = runGit('rev-parse --abbrev-ref HEAD') || 'main';

    // 3. Bump patch version
    const oldVersion = pkg.version || '2.5.0';
    const newVersion = bumpPatch(oldVersion);
    pkg.version = newVersion;

    // 4. Write updated package.json (preserve formatting)
    fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`[updateVersionHistory] Version bumped: ${oldVersion} → ${newVersion}`);

    // 5. Parse changelog for the new version
    //    First try exact match; fall back to first section in file
    let changelog = parseChangelog(newVersion);
    if (!changelog.length) changelog = parseChangelog(null);
    if (!changelog.length) changelog = [message];

    // 6. Read or initialize versionHistory.json
    let history = [];
    if (fs.existsSync(HIST_PATH)) {
        try {
            history = JSON.parse(fs.readFileSync(HIST_PATH, 'utf8'));
            if (!Array.isArray(history)) history = [];
        } catch {
            history = [];
        }
    }

    // 7. Build new entry
    const entry = {
        version  : newVersion,
        label    : `v${newVersion}`,
        hash,
        fullHash,
        branch,
        author,
        email,
        date,
        message,
        changelog
    };

    // 8. Prepend and cap at MAX_ENTRIES
    history.unshift(entry);
    if (history.length > MAX_ENTRIES) history = history.slice(0, MAX_ENTRIES);

    // 9. Ensure public/ exists and write file
    const publicDir = path.join(ROOT, 'public');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(HIST_PATH, JSON.stringify(history, null, 2) + '\n', 'utf8');

    console.log(`[updateVersionHistory] Wrote entry for ${newVersion} (${hash}) to versionHistory.json`);
    console.log(`[updateVersionHistory] Changelog entries: ${changelog.length}`);
    console.log(`[updateVersionHistory] Total history entries: ${history.length}`);

    // 10. Broadcast update notification to all in-app users (non-blocking)
    broadcastUpdate(newVersion, changelog);
})();
