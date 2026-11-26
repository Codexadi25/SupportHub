#!/usr/bin/env node
/**
 * updateVersionHistory.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Synchronizes package.json, CHANGELOG.md, and public/versionHistory.json.
 * Triggered automatically by GitHub Actions (.github/workflows/version-history.yml)
 * or can be run manually locally.
 *
 * Usage:
 *   node scripts/updateVersionHistory.js           # Bumps patch & updates versionHistory.json
 *   node scripts/updateVersionHistory.js --sync    # Syncs versionHistory.json with current version without bumping
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
const APP_URL      = process.env.APP_URL      || '';
const DEPLOY_SECRET= process.env.DEPLOY_SECRET || '';
const LOB          = (process.env.LOB || 'zomato').toLowerCase();
const IS_SYNC_ONLY = process.argv.includes('--sync') || process.argv.includes('--no-bump');

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
    if (parts.length !== 3 || parts.some(isNaN)) return '3.1.1';
    parts[2] += 1;
    return parts.join('.');
}

/**
 * Parse CHANGELOG.md and extract bullet-point lines under the target ## [version] heading.
 */
function parseChangelog(targetVersion) {
    if (!fs.existsSync(CHLOG_PATH)) return [];
    const md = fs.readFileSync(CHLOG_PATH, 'utf8');
    const lines = md.split('\n');

    let inSection = false;
    const bullets = [];

    for (const line of lines) {
        if (/^##\s+\[/.test(line)) {
            if (inSection) break;
            if (targetVersion && line.includes(`[${targetVersion}]`)) {
                inSection = true;
                continue;
            }
            if (!targetVersion) {
                inSection = true;
                continue;
            }
        }

        if (inSection) {
            const stripped = line.replace(/^[-*•]\s+/, '').trim();
            if (stripped && !stripped.startsWith('#') && !stripped.startsWith('---') && stripped !== '---') {
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
    if (!APP_URL || !DEPLOY_SECRET) return;

    try {
        const body = JSON.stringify({ version, changelog, secret: DEPLOY_SECRET });
        const url  = `${APP_URL}/api/${LOB}/messages/broadcast-update`;
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
            if (res.statusCode === 201) {
                console.log(`[updateVersionHistory] ✅ Broadcast sent — status ${res.statusCode}`);
            }
        });
        req.on('error', () => {});
        req.write(body);
        req.end();
    } catch {}
}

// ── Main ─────────────────────────────────────────────────────────────────────
(function main() {
    let pkg;
    try {
        pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
    } catch (err) {
        console.error('[updateVersionHistory] Cannot read package.json:', err.message);
        process.exit(1);
    }

    const hash     = runGit('rev-parse --short HEAD')       || 'manual';
    const fullHash = runGit('rev-parse HEAD')               || 'manual-commit';
    const author   = runGit('log -1 --pretty=format:%an')  || 'Codexadi25';
    const email    = runGit('log -1 --pretty=format:%ae')  || 'contactaditya25@gmail.com';
    const date     = runGit('log -1 --pretty=format:%aI')  || new Date().toISOString();
    const message  = runGit('log -1 --pretty=format:%s')   || 'Update release';
    const branch   = runGit('rev-parse --abbrev-ref HEAD') || 'main';

    let version = pkg.version || '3.1.0';
    if (!IS_SYNC_ONLY) {
        const oldVersion = version;
        version = bumpPatch(oldVersion);
        pkg.version = version;
        fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        console.log(`[updateVersionHistory] Version bumped: ${oldVersion} → ${version}`);
    } else {
        console.log(`[updateVersionHistory] Syncing existing version: ${version}`);
    }

    let changelog = parseChangelog(version);
    if (!changelog.length) changelog = parseChangelog(null);
    if (!changelog.length) changelog = [message];

    let history = [];
    if (fs.existsSync(HIST_PATH)) {
        try {
            history = JSON.parse(fs.readFileSync(HIST_PATH, 'utf8'));
            if (!Array.isArray(history)) history = [];
        } catch {
            history = [];
        }
    }

    const entry = {
        version,
        label: `LTS · v${version}`,
        hash,
        fullHash,
        branch,
        author,
        email,
        date,
        message,
        changelog
    };

    // Replace if same version exists, or prepend
    const existingIdx = history.findIndex(e => e.version === version);
    if (existingIdx >= 0) {
        history[existingIdx] = entry;
    } else {
        history.unshift(entry);
    }

    if (history.length > MAX_ENTRIES) history = history.slice(0, MAX_ENTRIES);

    const publicDir = path.join(ROOT, 'public');
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(HIST_PATH, JSON.stringify(history, null, 2) + '\n', 'utf8');

    console.log(`[updateVersionHistory] Updated versionHistory.json for v${version} (${hash})`);
    console.log(`[updateVersionHistory] Total history entries: ${history.length}`);
    broadcastUpdate(version, changelog);
})();
