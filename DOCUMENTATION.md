# SupportHub - Comprehensive Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Installation & Setup](#installation--setup)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Features](#features)
7. [User Roles & Permissions](#user-roles--permissions)
8. [Frontend Components](#frontend-components)
9. [Configuration](#configuration)
10. [Deployment](#deployment)
11. [Troubleshooting](#troubleshooting)
12. [Development Guide](#development-guide)

## Project Overview

SupportHub is a comprehensive support hub application built with Node.js, Express, and MongoDB. It provides a centralized platform for managing canned responses, private notes, feedback systems, messaging, administrative functions, and employee performance analytics.

### Key Features
- **Canned Responses Management**: Create, edit, and organize canned responses with categories and tags.
- **Private Notes**: Personal note-taking system with categorization.
- **Feedback System**: User feedback collection with admin/editor response capabilities.
- **Messaging System**: Broadcast messages with targeting and notification system.
- **Real-Time User Presence & Collaborator Bar (Google Docs style)**: Live avatars at the top showing active users across all departments in real-time.
- **PulseTrack Performance Suite**: Premium visual dashboards to track agent performance, daily rosters, shift schedules, breaks, and error logs.
- **Role-based Access Control**: User, Editor, Team Lead, and Admin roles with tailored departmental/global visibility permissions, plus explicit `hasAdminPanelAccess` overrides.

## Architecture

### Backend
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Session-based authentication
- **Real-time & Presence**: Firebase Realtime Database integration
- **File Upload**: Multer for file handling

### Frontend
- **Template Engine**: EJS
- **Styling**: CSS3 with custom design system
- **JavaScript**: Vanilla JavaScript with modular structure

### Project Structure
```
SupportHub/
├── app.js                 # Main application entry point
├── config/
│   └── database.js        # Database configuration
├── controllers/           # Business logic controllers
│   ├── adminController.js
│   ├── authController.js
│   ├── candController.js
│   ├── performanceController.js # PulseTrack logic controller
│   ├── pnController.js
│   └── userController.js
├── middleware/            # Express middleware
│   ├── authMiddleware.js
│   ├── errorMiddleware.js
│   ├── isAdmin.js
│   └── requestLogger.js
├── models/               # Mongoose models
│   ├── Category.js
│   ├── Feedback.js
│   ├── KpiTarget.js       # Target score configuration model
│   ├── Log.js
│   ├── Message.js
│   ├── PerformanceRecord.js # Core attendance/KPI data model
│   ├── PNCategory.js
│   ├── PrivateNote.js
│   ├── Team.js            # Department team structure model
│   ├── UploadBatch.js     # Tracking metadata for bulk imports
│   └── User.js
├── routes/               # API routes
│   ├── admin.js           # Admin routes
│   ├── performance.js     # Performance and metrics routes
│   ├── auth.js
│   ├── viewRoutes.js
│   └── ...
├── views/                # EJS templates
│   ├── index.ejs
│   ├── performanceDashboard.ejs
│   ├── performanceEmployee.ejs
│   ├── performanceLayout.ejs
│   └── partials/
│       ├── adminPanel.ejs
│       ├── performanceModals.ejs
│       └── ...
└── package.json
```

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd SupportHub
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env` file in the root directory:
   ```env
   NODE_ENV=development
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/supporthub
   SESSION_SECRET=your-super-secret-session-key
   ```

4. **Initialize Database**
   ```bash
   node scripts/initDB.js
   ```

5. **Align Database Org / IDs (Migration)**
   ```bash
   node scripts/alignOrgAndEmpId.js
   ```

6. **Start the Application**
   ```bash
   npm run dev
   ```

7. **Access the Application**
   Navigate to `http://localhost:3000`

## Database Schema

### User Model
```javascript
{
  username: String (required, unique, lowercase, alphanumeric & underscores only)
  password: String (required, hashed)
  role: String (enum: ['new','user', 'editor', 'admin', 'team_lead', 'quality_analyst', 'vendor'], default: 'new')
  organization: String (default: 'startek india')
  employeeId: String (default: '')
  hasAdminPanelAccess: Boolean (default: false)
  isActive: Boolean (default: true)
}
```

### PerformanceRecord Model
```javascript
{
  userId: ObjectId (ref: 'User', default: null)
  employeeId: String (required)
  agentName: String (required)
  organization: String (default: 'startek india')
  department: String (default: 'none')
  teamId: ObjectId (ref: 'Team', default: null)
  date: Date (required)
  status: String (enum: ['present','absent','half_day','leave','work_from_home','week_off','holiday','training'], default: 'present')
  ticketsProcessed: Number (default: 0)
  aht: Number (default: 0)
  qualityScore: Number (default: 0)
  performanceScore: Number (default: 0)
  csat: Number (default: 0)
  fcr: Number (default: 0)
}
```

## API Endpoints

### Performance & PulseTrack Routes
- `GET /performance/dashboard` - Main metrics landing page (view)
- `GET /performance/employee` - Individual scorecard profile (view)
- `GET /api/performance/summary` - Today's stats & KPI averages
- `GET /api/performance/records` - Paginated performance history
- `POST /api/performance/record` - Save/Update manual performance record
- `POST /api/performance/bulk-upload` - Upload Excel roster sheet
- `POST /api/performance/settings` - Set KPI targets
- `GET /api/performance/shared-report/:token` - View encrypted shared report

### Admin Routes
- `POST /api/admin/employee-mapping/map` - Map existing user to Employee ID
- `POST /api/admin/employee-mapping/create-unknown` - Provision dummy deactivated employee record

## User Roles & Permissions

### hasAdminPanelAccess Override
Non-admin/non-TL users who have been granted explicit permissions via `hasAdminPanelAccess: true` will be authorized to access the Admin Panel and manage Employee mappings.

---

### Designed & Developed from scratch by Aditya Sahu | [Aditya Tech. & Devoops. &copy; 2026](https://adityatechndevoops.web.app)

---
**Last Updated**: 14 June 2026
**Version**: 3.0.0 (PulseTrack Performance Suite Edition)
