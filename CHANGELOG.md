# Changelog — SupportHub

All notable changes are documented here.
Format: `## [version] — YYYY-MM-DD`

---

## [2.5.1] — 2026-05-31

### 🆕 New Features
- **Strict Username Characters Validation** — Users are now restricted from using any special characters in their usernames except for underscores (`_`) during registration and profile settings. Enforced at the Mongoose database schema level.
- **🛡️ Login Security Interception** — Attempting to log in with an invalid username containing special characters automatically triggers a security guidelines warning block on 30-May-2026 guidelines.
- **🔑 Admin Delete Two-Factor Layer** — Administrative deletion of user accounts now requires prompt confirmation by typing the exact username of the target account to prevent accidental deletes.
- **Inline Smart SOP Panel Integration** — The "Smart SOP" button now opens the SOP view/editor inline directly inside the dashboard tabs rather than redirecting the user to a separate browser tab, providing a more cohesive experience.

### ✨ Improvements
- Added live oninput frontend sanitization for the username input field during registration and profile setting changes to automatically strip out disallowed special characters.
- Implemented character validation inside the admin bulk user creation loop, cleanly filtering disallowed usernames to the failed operations table.

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
