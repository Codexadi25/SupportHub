require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const connectDB = require('./config/database');
const { errorHandler } = require('./middleware/errorMiddleware');
const requestLogger = require('./middleware/requestLogger');

// Connect to Database
connectDB();

// Initialize Firebase Admin SDK for presence tracking
const firebaseService = require('./services/firebaseService');
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './config/firebase-key.json';

try {
  firebaseService.initializeFirebase(serviceAccountPath);
} catch (error) {
  console.warn('[App] Firebase initialization error (non-critical):', error.message);
  console.warn('[App] Presence tracking features will be disabled.');
}

// --- SOP Routes Integration ---

const app = express();
const server = http.createServer(app);

// IP normalization middleware to always extract a clean IPv4 address
app.use((req, res, next) => {
  let ip = req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || '127.0.0.1';
  
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  
  if (ip === '::1') {
    ip = '127.0.0.1';
  } else if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  
  // Normalize req.ip
  Object.defineProperty(req, 'ip', {
    value: ip,
    writable: true,
    configurable: true
  });
  
  // Normalize req.connection.remoteAddress if it exists
  if (req.connection) {
    Object.defineProperty(req.connection, 'remoteAddress', {
      value: ip,
      writable: true,
      configurable: true
    });
  }
  
  next();
});

// If your app is behind a proxy/load balancer in production (e.g., Heroku, nginx),
// enable trust proxy so secure cookies work properly.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Make moment available to EJS templates
try {
  const moment = require('moment');
  app.locals.moment = moment;
} catch (err) {
  // moment is optional; templates will need to guard if unavailable
  console.warn('moment not available for templates:', err.message);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
// Ensure session is initialized before requestLogger so user info is available for logs
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // avoid creating sessions for anonymous requests
    rolling: true, // reset cookie expiration on every response
    cookie: {
        secure: process.env.NODE_ENV === 'production', // only send over HTTPS in prod
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
}));

// Add request logging middleware after session is available
app.use(requestLogger);

// Map session user to req.user for convenience in handlers
app.use((req, res, next) => {
  if (req.session && req.session.user) req.user = req.session.user;
  next();
});

// Dev-only quick-login (non-production) to set a test user in session
if (process.env.NODE_ENV !== 'production') {
  app.get('/dev/login', (req, res) => {
    // Only allow dev login when explicitly enabled
    if (process.env.DEV_LOGIN !== 'true') return res.status(403).send('Dev login disabled');
    const role = req.query.role || 'admin';
    const username = req.query.username || 'devuser';
    const lob = req.query.lob || 'zomato';
    req.session.user = { username, role, lob };
    res.send(`Dev login set: ${username} (${role}) for lob=${lob}`);
  });
}

// mount ping endpoint (keep it under /api so client fetch('/api/ping') works)
app.use('/api', require('./routes/ping'));

// Routes
const adminRouter = require('./routes/admin');
const apiUsersRouter = require('./routes/users'); // for legacy /api/users/bulk route
app.use('/api/admin', adminRouter);
app.use('/api', apiUsersRouter);
app.use('/api', require('./routes/api/userActivity'));
app.use('/', require('./routes/viewRoutes'));

// SOP Routes
const sopRoutes = require('./routes/sopRoutes');
app.use('/:lob/sop', sopRoutes);

app.use('/auth', require('./routes/authRoutes'));
app.use('/api/:lob/cands', require('./routes/api/candRoutes'));
app.use('/api/:lob/pns', require('./routes/api/pnRoutes'));
app.use('/api/:lob/feedback', require('./routes/api/feedbackRoutes'));
app.use('/api/:lob/messages', require('./routes/api/messageRoutes'));
app.use('/api/:lob/notices', require('./routes/api/noticeRoutes'));
// ... other API routes

// Error Handler
app.use(errorHandler);

let PORT = parseInt(process.env.PORT, 10) || 3000;

function startServer(port) {
  try {
    server.listen(port, () => console.log(`Server running on port ${port}`));
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`Port ${port} in use, retrying on ${nextPort}...`);
      startServer(nextPort);
    } else {
      throw err;
    }
  }
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    const nextPort = PORT + 1;
    console.warn(`Port ${PORT} in use, retrying on ${nextPort}...`);
    PORT = nextPort;
    setTimeout(() => startServer(PORT), 250);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

startServer(PORT);