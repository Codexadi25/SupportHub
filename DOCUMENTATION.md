# WIMOBOT - Comprehensive Documentation

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

WIMOBOT is a comprehensive support hub application built with Node.js, Express, and MongoDB. It provides a centralized platform for managing canned responses, private notes, feedback systems, messaging, and administrative functions.

### Key Features
- **Canned Responses Management**: Create, edit, and organize canned responses with categories and tags
- **Private Notes**: Personal note-taking system with categorization
- **Feedback System**: User feedback collection with admin/editor response capabilities
- **Messaging System**: Broadcast messages with targeting and notification system
- **Real-Time User Presence & Collaborator Bar (Google Docs style)**: Live avatars at the top showing active users across all departments in real-time, complete with detailed status tooltips (Online, On Break, Idle, or Unavailable)
- **Admin Panel**: User management, bulk operations, and real-time user activity monitoring
- **Role-based Access Control**: User, Editor, Team Lead, and Admin roles with tailored departmental/global visibility permissions

## Architecture

### Backend
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Session-based authentication
- **Real-time & Presence**: Firebase Realtime Database integration for instant, multi-session user presence sync, augmented by WebSocket support for live updates
- **File Upload**: Multer for file handling

### Frontend
- **Template Engine**: EJS
- **Styling**: CSS3 with custom design system
- **JavaScript**: Vanilla JavaScript with modular structure
- **Real-time Updates**: WebSocket client integration

### Project Structure
```
WIMOBOT/
├── app.js                 # Main application entry point
├── config/
│   └── database.js        # Database configuration
├── controllers/           # Business logic controllers
│   ├── adminController.js
│   ├── authController.js
│   ├── candController.js
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
│   ├── Log.js
│   ├── Message.js
│   ├── PNCategory.js
│   ├── PrivateNote.js
│   └── User.js
├── routes/               # API routes
│   ├── api/
│   │   ├── adminRoutes.js
│   │   ├── candRoutes.js
│   │   ├── feedbackRoutes.js
│   │   ├── messageRoutes.js
│   │   ├── pnRoutes.js
│   │   ├── userRoutes.js
│   │   └── userActivity.js # User presence and activity routes
│   ├── auth.js
│   ├── authRoutes.js
│   ├── ping.js            # Heartbeat and keep-alive ping sync route
│   ├── users.js
│   └── viewRoutes.js
├── services/             # Third-party integrations
│   ├── aiService.js       # AI generation logic
│   └── firebaseService.js # Firebase Realtime Database presence logic
├── utils/                # Utility functions
│   ├── autoTagGenerator.js
│   ├── logger.js
│   ├── messageCleanup.js
│   └── webSocketServer.js
├── views/                # EJS templates
│   ├── index.ejs
│   ├── login.ejs
│   ├── register.ejs
│   └── partials/
│       ├── adminPanel.ejs
│       ├── calculator.ejs
│       ├── candPanel.ejs
│       ├── feedbackPanel.ejs
│       ├── footer.ejs
│       ├── header.ejs
│       ├── loggerPanel.ejs
│       ├── messagePanel.ejs
│       ├── pnPanel.ejs
│       └── userActivityDashboard.ejs # Live user activity dashboard panel
├── public/               # Static assets
│   ├── css/
│   │   ├── feedback.css
│   │   ├── messages.css
│   │   └── style.css
│   └── js/
│       ├── admin.js
│       ├── feedback.js
│       ├── main.js
│       ├── messages.js
│       ├── presenceBar.js  # Global top-bar Google Docs-style presence script
│       └── userActivityDashboard.js # Real-time dashboard client script
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
   cd WIMOBOT
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
   MONGODB_URI=mongodb://localhost:27017/wimobot
   SESSION_SECRET=your-super-secret-session-key
   ```

4. **Database Setup**
   ```bash
   # Start MongoDB service
   # On Windows: net start MongoDB
   # On macOS: brew services start mongodb-community
   # On Linux: sudo systemctl start mongod
   ```

5. **Initialize Database**
   ```bash
   node initDB.js
   ```

6. **Create Admin User**
   ```bash
   node createAdmin.js
   ```

7. **Start the Application**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

8. **Access the Application**
   Open your browser and navigate to `http://localhost:3000`

## Database Schema

### User Model
```javascript
{
  username: String (required, unique, lowercase, alphanumeric & underscores only)
  password: String (required, hashed)
  role: String (enum: ['new','user', 'editor', 'admin', 'team_lead', 'quality_analyst', 'vendor'], default: 'new')
  createdAt: Date
  updatedAt: Date
}
```

### Category Model (Canned Responses)
```javascript
{
  title: String (required)
  templates: [{
    tags: [String]
    text: String (required)
  }]
  createdAt: Date
  updatedAt: Date
}
```

### PrivateNote Model
```javascript
{
  title: String (required)
  content: String (required)
  tags: [String] (default: [])
  category: String (required)
  user: ObjectId (ref: 'User', required)
  createdAt: Date
  updatedAt: Date
}
```

### Feedback Model
```javascript
{
  userId: ObjectId (ref: 'User', required)
  username: String (required)
  type: String (enum: ['suggestion', 'bug_report', 'feature_request', 'cand_modification', 'tag_change', 'general'])
  title: String (required, maxlength: 200)
  description: String (required, maxlength: 2000)
  priority: String (enum: ['low', 'medium', 'high', 'critical'], default: 'medium')
  status: String (enum: ['pending', 'in_progress', 'resolved', 'rejected'], default: 'pending')
  adminResponse: String (maxlength: 1000)
  adminId: ObjectId (ref: 'User')
  tags: [String] (maxlength: 50 each)
  isPublic: Boolean (default: false)
  upvotes: [ObjectId] (ref: 'User')
  downvotes: [ObjectId] (ref: 'User')
  createdAt: Date
  updatedAt: Date
}
```

### Message Model
```javascript
{
  title: String (required, maxlength: 200)
  content: String (required, maxlength: 2000)
  authorId: ObjectId (ref: 'User', required)
  authorName: String (required)
  targetUsers: [ObjectId] (ref: 'User')
  targetRoles: [String] (enum: ['user', 'editor', 'admin', 'all'])
  priority: String (enum: ['low', 'medium', 'high', 'urgent'], default: 'medium')
  type: String (enum: ['announcement', 'maintenance', 'update', 'warning', 'info'], default: 'info')
  isActive: Boolean (default: true)
  startDate: Date (default: Date.now)
  endDate: Date (required)
  isRead: [{
    userId: ObjectId (ref: 'User')
    readAt: Date (default: Date.now)
  }]
  attachments: [{
    filename: String
    originalName: String
    mimetype: String
    size: Number
    url: String
  }]
  createdAt: Date
  updatedAt: Date
}
```

### Log Model
```javascript
{
  level: String (enum: ['info', 'warn', 'error'])
  message: String (required)
  stack: String
  metadata: Object
  createdAt: Date
}
```

## API Endpoints

### Authentication Routes
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `GET /auth/logout` - User logout

### Canned Responses (Cands) Routes
- `GET /api/cands` - Get all canned responses
- `POST /api/cands` - Create new canned response
- `PUT /api/cands/:id` - Update canned response
- `DELETE /api/cands/:id` - Delete canned response

### Private Notes (PNs) Routes
- `GET /api/pns` - Get user's private notes
- `POST /api/pns` - Create new private note
- `PUT /api/pns/:id` - Update private note
- `DELETE /api/pns/:id` - Delete private note

### Feedback Routes
- `GET /api/feedback/` - Get all feedback (visible to all users)
- `GET /api/feedback/my` - Get user's own feedback
- `POST /api/feedback` - Submit new feedback
- `PUT /api/feedback/:id/status` - Update feedback status (admin/editor only)
- `POST /api/feedback/:id/vote` - Vote on feedback
- `DELETE /api/feedback/:id` - Delete feedback (admin only)

### Message Routes
- `GET /api/messages/my` - Get user's messages
- `GET /api/messages/` - Get all messages (admin only)
- `POST /api/messages` - Create new message (admin only)
- `PUT /api/messages/:id` - Update message (admin only)
- `DELETE /api/messages/:id` - Delete message (admin only)
- `POST /api/messages/:id/read` - Mark message as read
- `GET /api/messages/users` - Get all users for targeting (admin only)
- `POST /api/messages/cleanup` - Cleanup expired messages (admin only)

### User Activity & Presence Routes
- `GET /api/user-activity/firebase-config` - Fetch client Firebase config securely
- `GET /api/user-activity/department-users` - Fetch and merge department presence (or all presence for Admins)
- `GET /api/user-activity/stats` - Fetch real-time active statistics for dashboard
- `GET /api/ping` - Extended heartbeat ping endpoint; automatically syncs status to Firebase RTDB
- `POST /api/heartbeat` - Enhanced server heartbeat endpoint; automatically syncs status to Firebase RTDB

### Admin Routes
- `GET /api/admin/logs` - Get system logs
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:id/role` - Update user role
- `DELETE /api/admin/users/:id` - Delete user
- `PUT /api/admin/users/:id/password` - Set user password
- `POST /api/admin/users/:id/reset-password` - Reset user password
- `POST /api/admin/users/bulk` - Bulk create users
- `POST /api/admin/bulk-upload-cands` - Bulk upload canned responses
- `POST /api/admin/cleanup-logs` - Cleanup old logs

## Features

### 1. Canned Responses Management
- **Create & Edit**: Add new canned responses with categories and tags
- **Search & Filter**: Find responses by text content or tags
- **Categories**: Organize responses into logical groups
- **Bulk Operations**: Import/export canned responses via JSON
- **Auto-tagging**: Automatic tag generation based on content

### 2. Private Notes System
- **Personal Notes**: Create and manage personal notes
- **Categorization**: Organize notes by categories
- **CRUD Operations**: Full create, read, update, delete functionality
- **User Isolation**: Notes are private to each user

### 3. Feedback System
- **Public Visibility**: All feedback visible to all users
- **Admin/Editor Controls**: Status management and responses
- **Feedback Types**: Suggestions, bug reports, feature requests, etc.
- **Priority Levels**: Low, medium, high, critical
- **Voting System**: Upvote/downvote public feedback
- **Status Tracking**: Pending, in progress, resolved, rejected

### 4. Messaging System
- **Broadcast Messages**: Send messages to all users or specific groups
- **Targeting Options**: Target by role or specific users
- **Message Types**: Announcements, maintenance, updates, warnings, info
- **Priority Levels**: Low, medium, high, urgent
- **Read Tracking**: Track who has read messages
- **Notification Bell**: Visual indicator for unread messages
- **Expiration**: Messages can have end dates

### 5. Admin Panel
- **User Management**: Create, edit, delete users
- **Role Management**: Assign user, editor, admin roles
- **Bulk Operations**: Bulk user creation and canned response upload
- **System Logs**: View and manage system logs
- **Password Management**: Reset and set user passwords

### 6. Real-Time Presence & Collaborator Bar (Google Docs style)
- **Top-bar Collaborator Indicators**: Renders circular avatars representing currently logged-in and active users across the entire application in real-time, just like Google Docs.
- **Glassmorphic Status Tooltips**: Hovering over avatars displays live details: active status (Online, On Break, Idle), role, department, and precise last seen timestamp.
- **Dynamic User Activity Dashboard**: Provides real-time user status lists and telemetry inside the Admin Tab, with auto-calculated counts for active users.
- **Unified Heartbeat Synchronization**: Connects client-side keep-alive pings and heartbeats directly to Firebase Realtime Database, immediately reflecting user actions.
- **Premium Client-Side Sorting**: Collaborator bar automatically places the current user first, followed by online users, on-break users, and idle users, with alphabetical tiebreakers.

## User Roles & Permissions

### User Role
- View all canned responses
- Create and manage private notes
- Submit feedback
- View and respond to messages
- Vote on public feedback

### Editor Role
- All User permissions
- Respond to feedback
- Update feedback status
- Manage feedback (mark as resolved, pending, etc.)

### Admin Role
- All Editor permissions
- User management
- System administration
- Create and manage messages
- Access admin panel
- Bulk operations
- System logs access

## Frontend Components

### Main Dashboard (`index.ejs`)
- Tab-based navigation
- User information display
- Search functionality
- Real-time updates

### Canned Responses Panel (`candPanel.ejs`)
- Response list with categories
- Search and filter controls
- Add/edit/delete functionality
- Tag management

### Private Notes Panel (`pnPanel.ejs`)
- Personal notes list
- Category navigation
- Note management controls
- CRUD operations

### Feedback Panel (`feedbackPanel.ejs`)
- Feedback list (all users can see)
- Admin/editor controls for status management
- Feedback submission form
- Voting system

### Messages Panel (`messagePanel.ejs`)
- Message list with read status
- Notification bell with count
- Message creation (admin only)
- Read/unread tracking

### Admin Panel (`adminPanel.ejs`)
- User management table
- Bulk operations
- System logs
- Configuration options

## Configuration

### Environment Variables
```env
NODE_ENV=development|production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/wimobot
SESSION_SECRET=your-secret-key
```

### Database Configuration
The application uses MongoDB with Mongoose ODM. Connection settings are in `config/database.js`.

### Session Configuration
- Secure cookies in production
- 7-day session duration
- Rolling sessions (reset on activity)

## Deployment

### Production Setup
1. Set `NODE_ENV=production`
2. Use a production MongoDB instance
3. Set up reverse proxy (nginx)
4. Use PM2 for process management
5. Enable HTTPS
6. Set up monitoring and logging

### PM2 Configuration
```json
{
  "name": "wimobot",
  "script": "app.js",
  "instances": 1,
  "exec_mode": "cluster",
  "env": {
    "NODE_ENV": "production",
    "PORT": 3000
  }
}
```

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   - Check MongoDB service status
   - Verify connection string
   - Check network connectivity

2. **Session Issues**
   - Clear browser cookies
   - Check session secret configuration
   - Verify session store

3. **File Upload Issues**
   - Check multer configuration
   - Verify file size limits
   - Check disk space

4. **WebSocket Issues**
   - Check WebSocket server initialization
   - Verify client connection
   - Check firewall settings

### Logs
- Application logs are stored in the database
- Access logs via admin panel
- Check console output for errors

## Development Guide

### Adding New Features
1. Create model in `models/` directory
2. Add controller in `controllers/` directory
3. Create routes in `routes/api/` directory
4. Add frontend components in `views/` and `public/js/`
5. Update documentation

### Code Style
- Use async/await for asynchronous operations
- Follow Express.js best practices
- Use meaningful variable names
- Add error handling
- Include JSDoc comments for functions

### Testing
- Test API endpoints with Postman or similar
- Test frontend functionality manually
- Verify role-based access control
- Test error scenarios

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## Support

For issues, questions, or contributions, please refer to the project repository or contact the development team.

### Designed & Developed from scratch by Aditya Sahu | [Aditya Tech. & Devoops. &copy; 2025](https://adityatechndevoops.web.app)

---
**Last Updated**: 31 May 2026
**Version**: 2.5.1 (Real-Time Presence & Strict Security Edition)
