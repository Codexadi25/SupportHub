# Changelog — SupportHub

All notable changes are documented here.
Format: `## [version] — YYYY-MM-DD`

---

## [2.5.0] — 2026-05-30

### 🆕 New Features
- **Version History** — Every GitHub push now auto-records a versioned commit entry in a premium in-app changelog modal. Click the version tag in the footer to explore the full timeline.
- **Automated CI Versioning** — GitHub Actions workflow (`update-version.yml`) bumps the patch version and broadcasts an in-app update notification on every push to `main`.
- **Update Notifications** — All users now receive an in-app message in the **Messages** section whenever a new version is deployed.

### ✨ Improvements
- **Private Notes — Masonry Gallery UI** — Notes panel now renders in a Pinterest-style multi-column masonry layout with dynamic card heights and a custom scrollbar.
- **Font Size Scaling** — Added 4-level global font scaling (Small / Medium / Large / Extra Large) adjustable per-user from the Profile settings.
- **Private Notes Access Policy** — Enforced granular access: admins have full system-wide visibility and control; regular users can only create, edit, or delete their own notes.
- **Private Notes Edit/Delete Buttons** — Fixed event delegation for nested SVG icon clicks using `.closest()` so buttons are reliably responsive.

### 🐛 Bug Fixes
- Footer now consistently sits below the 100vh app wrapper.
- Resolved button delegation failure when clicking child SVG elements inside action buttons.
- Fixed admin access policy gap where non-admin users could previously modify others' private notes.

---

## [2.4.9] — LTS (Previous Stable)

Previous long-term stable release.
