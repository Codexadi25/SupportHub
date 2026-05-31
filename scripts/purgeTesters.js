/**
 * purgeTesters.js
 * Removes all *_tester presence nodes from Firebase RTDB.
 * Works via the public REST API — no service account needed.
 *
 * Usage:  node scripts/purgeTesters.js
 */

require('dotenv').config();

const DB_URL = process.env.FIREBASE_DATABASE_URL;
if (!DB_URL) {
  console.error('[purgeTesters] FIREBASE_DATABASE_URL is not set in .env');
  process.exit(1);
}

const base = DB_URL.endsWith('/') ? DB_URL.slice(0, -1) : DB_URL;

async function rest(path, method = 'GET', body = null) {
  const url = `${base}/${path}.json`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${method} ${url}`);
  const text = await res.text();
  return text === 'null' ? null : JSON.parse(text);
}

async function main() {
  console.log('[purgeTesters] Fetching all presence data…');
  const data = await rest('presence');

  if (!data) {
    console.log('[purgeTesters] No presence data found — Firebase is already clean.');
    return;
  }

  let removed = 0;

  for (const [dept, users] of Object.entries(data)) {
    if (!users || typeof users !== 'object') continue;

    for (const username of Object.keys(users)) {
      if (username.toLowerCase().includes('_tester')) {
        const path = `presence/${dept}/${username}`;
        try {
          await rest(path, 'DELETE');
          console.log(`  ✓ Deleted  presence/${dept}/${username}`);
          removed++;
        } catch (err) {
          console.error(`  ✗ Failed to delete ${path}:`, err.message);
        }
      }
    }
  }

  if (removed === 0) {
    console.log('[purgeTesters] No _tester nodes found in Firebase.');
  } else {
    console.log(`[purgeTesters] Done — removed ${removed} tester node(s) from Firebase.`);
  }
}

main().catch(err => {
  console.error('[purgeTesters] Fatal error:', err);
  process.exit(1);
});
