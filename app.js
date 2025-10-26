require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const connectDB = require('./config/database');
const { initializeWebSocketServer } = require('./utils/webSocketServer');
const { errorHandler } = require('./middleware/errorMiddleware');
const requestLogger = require('./middleware/requestLogger');
const authRouter = require('./routes/auth');

// Connect to Database
connectDB();

const app = express();
const server = http.createServer(app);

// If your app is behind a proxy/load balancer in production (e.g., Heroku, nginx),
// enable trust proxy so secure cookies work properly.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Initialize WebSocket Server
const wss = initializeWebSocketServer(server);
// Prevent unhandled 'error' (e.g., EADDRINUSE re-emitted) from crashing the process
wss.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.warn('WebSocketServer port in use; HTTP server will retry on next port.');
    return; // swallow; server 'error' handler will retry
  }
  console.error('WebSocketServer error:', err);
});
app.set('wss', wss); // Make WSS available in controllers

// EJS Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

// mount ping endpoint (keep it under /api so client fetch('/api/ping') works)
app.use('/api', require('./routes/ping'));

// Routes
app.use('/', authRouter);
app.use('/', require('./routes/viewRoutes'));
app.use('/auth', require('./routes/authRoutes'));
app.use('/api/cands', require('./routes/api/candRoutes'));
app.use('/api/pns', require('./routes/api/pnRoutes'));
app.use('/api/feedback', require('./routes/api/feedbackRoutes'));
app.use('/api/messages', require('./routes/api/messageRoutes'));
app.use('/api/notices', require('./routes/api/noticeRoutes'));
const adminRouter = require('./routes/admin');
const apiUsersRouter = require('./routes/users'); // for legacy /api/users/bulk route
app.use('/api/admin', adminRouter);
app.use('/api', apiUsersRouter);
app.use('/api', require('./routes/api/userActivity'));
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