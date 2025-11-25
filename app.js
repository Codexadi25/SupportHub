require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const connectDB = require('./config/database');
const { initializeWebSocketServer } = require('./utils/webSocketServer');
const { errorHandler } = require('./middleware/errorMiddleware');

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

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// mount ping endpoint (keep it under /api so client fetch('/api/ping') works)
app.use('/api', require('./routes/ping'));

// API Routes
app.use('/api/auth', require('./routes/api/authRoutes'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/users', require('./routes/users')); // for legacy /api/users/bulk route
app.use('/api', require('./routes/api/userActivity'));
app.use('/api/cands', require('./routes/api/candRoutes'));
app.use('/api/pns', require('./routes/api/pnRoutes'));
app.use('/api/feedback', require('./routes/api/feedbackRoutes'));
app.use('/api/messages', require('./routes/api/messageRoutes'));
app.use('/api/notices', require('./routes/api/noticeRoutes'));
// ... other API routes

// Serve React App
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the 'dist' directory
  app.use(express.static(path.join(__dirname, 'dist')));

  // For any other request, serve the index.html file
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}


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