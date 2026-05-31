# SupportHub 🚀 (v2.5.1)

SupportHub is a premium, real-time collaboration and unified canned responses platform designed to boost support agent efficiency, streamline team workflow, and secure internal knowledge resources.

## 🌟 What's New in v2.5.1

- **🔒 Strict Username Policy & Validation**:
  - Direct alphanumeric and underscore-only validation (`/^[a-zA-Z0-9_]+$/`) is now strictly enforced at the database schema level (Mongoose), registration controllers, and profile update endpoints.
  - Interactive live frontend sanitization automatically strips spaces, dots, dashes, and other special characters during typing to provide immediate feedback.
- **🛡️ Login Security Interception**:
  - Login attempts utilizing usernames with invalid formats are caught by a security interception layer, displaying an explicit guidelines warning prompting the user to create a fresh, clean account under the new rules.
- **🔑 Two-Factor Admin Deletion Confirmation**:
  - Administrative deletion of user accounts now requires a two-factor confirmation layer, prompt-verifying the exact username of the target account to prevent accidental database deletes.
- **⚡ Seamless Inline Smart SOP Panel**:
  - The "Smart SOP" feature is fully integrated directly into the dashboard tabs framework. Agents and admins can view and edit SOPs inline within the main dashboard without separate browser tab redirects.

## ⚙️ Key Technical Stack
- **Backend**: Node.js, Express, MongoDB/Mongoose
- **Real-Time Integration**: Firebase Realtime Database
- **Template Engine**: EJS (Premium custom layout & ambient night-mode themes)
- **Styling & Transitions**: Custom premium Vanilla CSS design system

---

### Designed & Developed from scratch by Aditya Sahu | [Aditya Tech. & Devoops. &copy; 2026](https://adityatechndevoops.web.app)
