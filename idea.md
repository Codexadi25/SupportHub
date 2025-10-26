Here is a complete, self-contained implementation of a WhatsApp-style "Online" and "Last Seen" feature for your web app, using Express.js, EJS, and WebSockets.

This solution is built on the core logic WhatsApp uses:

1.  **"Online"**: The user has an active, open WebSocket connection to your server.
2.  **"Last Seen"**: A timestamp recorded in your database *the moment* that WebSocket connection is lost (either by the user closing the tab or by a connection timeout).
3.  **Heartbeat**: A "ping/pong" mechanism to detect abrupt disconnections (like losing Wi-Fi or closing a laptop).

-----

### Backend: `app.js`

This file runs your Express server and the WebSocket server. It manages live connections, listens for heartbeats, and updates the "Last Seen" status in a mock database.

```javascript
// Install dependencies: npm install express ejs ws
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const url = require('url');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public')); // For any potential CSS/client-JS files

// --- Mock Database ---
// In a real app, this would be your MongoDB or PostgreSQL 'users' collection.
const usersDB = new Map();
usersDB.set('101', { id: '101', name: 'Aditya', last_seen: null });
usersDB.set('102', { id: '102', name: 'Jane', last_seen: null });
usersDB.set('103', { id: '103', name: 'Mike', last_seen: null });

// --- In-Memory Connection Tracking ---
// This map stores the state of *currently connected* users.
// Key: userId, Value: { ws: WebSocket, heartbeatTimer: Timeout }
const liveConnections = new Map();

const HEARTBEAT_INTERVAL = 10000; // 10 seconds
const HEARTBEAT_TIMEOUT = HEARTBEAT_INTERVAL * 2; // 20 seconds. User is disconnected if no ping is received.

/**
 * Gets the full list of all users and their *current* status.
 * This is the "source of truth" for the dashboard.
 */
function getAllUserStatuses() {
    const allUsers = [];
    // Loop through the main DB
    for (const [userId, user] of usersDB.entries()) {
        const isOnline = liveConnections.has(userId);
        allUsers.push({
            id: user.id,
            name: user.name,
            isOnline: isOnline,
            last_seen: isOnline ? null : user.last_seen,
        });
    }
    return allUsers;
}

/**
 * Broadcasts the latest user statuses to EVERY connected client.
 */
function broadcastPresenceUpdate() {
    const allUsers = getAllUserStatuses();
    const payload = JSON.stringify({
        type: 'presence_update',
        users: allUsers,
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

/**
 * Terminates a user's connection and updates their 'last_seen'.
 */
function handleDisconnect(userId) {
    const connection = liveConnections.get(userId);
    if (!connection) return;

    // 1. Clear the heartbeat timer
    if (connection.heartbeatTimer) {
        clearTimeout(connection.heartbeatTimer);
    }

    // 2. Update the 'last_seen' timestamp in our "database"
    const user = usersDB.get(userId);
    if (user) {
        user.last_seen = new Date(); // The critical step!
        usersDB.set(userId, user);
    }

    // 3. Remove from live tracking
    liveConnections.delete(userId);

    console.log(`User ${userId} disconnected. Updated last_seen.`);

    // 4. Tell everyone this user is now offline
    broadcastPresenceUpdate();
}

/**
 * Starts the heartbeat check for a user.
 * This sets a timer. If the timer fires, the user is disconnected.
 */
function startHeartbeat(userId) {
    const connection = liveConnections.get(userId);
    if (!connection) return;

    // Clear any old timer
    if (connection.heartbeatTimer) {
        clearTimeout(connection.heartbeatTimer);
    }

    // Set a new timer.
    connection.heartbeatTimer = setTimeout(() => {
        // This code runs if a heartbeat is *NOT* received in time.
        console.log(`Heartbeat timeout for user ${userId}. Terminating connection.`);
        // Gracefully terminate the socket. This will trigger the 'close' event.
        connection.ws.terminate();
    }, HEARTBEAT_TIMEOUT);
}

/**
 * Resets a user's heartbeat timer.
 * This is called when a 'ping' is received.
 */
function resetHeartbeat(userId) {
    // This function just starts a new timer, effectively "resetting" it.
    startHeartbeat(userId);
}

// --- WebSocket Server Logic ---

wss.on('connection', (ws, req) => {
    // --- User Identification ---
    // In a real app, you'd get this from a secure session cookie or JWT.
    // For this demo, we'll get it from a query parameter: ws://.../?userId=101
    const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const userId = params.get('userId');

    if (!userId || !usersDB.has(userId)) {
        console.log('Invalid or missing userId. Connection rejected.');
        ws.close();
        return;
    }

    console.log(`User ${userId} connected.`);

    // --- Add user to live tracking ---
    liveConnections.set(userId, { ws, heartbeatTimer: null });

    // --- Update their status (clear 'last_seen') ---
    const user = usersDB.get(userId);
    user.last_seen = null; // They are online, so they have no 'last_seen'
    usersDB.set(userId, user);

    // Start the heartbeat mechanism
    startHeartbeat(userId);

    // Tell everyone this user is now online
    broadcastPresenceUpdate();

    // Handle messages from the client
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);

            // Client is sending a heartbeat
            if (msg.type === 'heartbeat_ping') {
                // Send a 'pong' back (optional, but good for client to know)
                ws.send(JSON.stringify({ type: 'heartbeat_pong' }));
                // Reset their timeout timer
                resetHeartbeat(userId);
            }
            
            // You could add "typing" status logic here
            // if (msg.type === 'typing_start') { ... }
            // if (msg.type === 'typing_stop') { ... }

        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        // This triggers on graceful close (tab closed) OR
        // on ws.terminate() from our heartbeat timeout.
        handleDisconnect(userId);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userId}:`, error);
        handleDisconnect(userId); // Treat errors as disconnects
    });
});

// --- Express Routes ---

// Simple login page to let the user "log in" as a user
app.get('/', (req, res) => {
    res.render('login', { users: Array.from(usersDB.values()) });
});

// The main dashboard showing all users
app.get('/dashboard', (req, res) => {
    // We *must* have a userId to know who "we" are
    const { userId } = req.query;
    if (!userId || !usersDB.has(userId)) {
        res.redirect('/');
        return;
    }
    
    // Get the initial data to render the page
    const allUsers = getAllUserStatuses();
    const me = usersDB.get(userId);
    
    res.render('presence', {
        myUserId: me.id,
        myName: me.name,
        users: allUsers,
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running. Open http://localhost:${PORT} to log in.`);
});
```

-----

### Frontend: `views/login.ejs`

This is a simple page to let you "log in" as one of your mock users.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Login</title>
    <style>
        body { font-family: sans-serif; display: grid; place-items: center; min-height: 90vh; background: #f4f4f4; }
        .login-box { background: #fff; border: 1px solid #ccc; border-radius: 8px; padding: 2rem; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        h1 { margin-top: 0; }
        a { display: block; padding: 10px 15px; margin: 10px 0; background: #007bff; color: white; text-decoration: none; border-radius: 5px; text-align: center; }
        a:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="login-box">
        <h1>Log in as...</h1>
        <% users.forEach(user => { %>
            <a href="/dashboard?userId=<%= user.id %>">
                <%= user.name %> (ID: <%= user.id %>)
            </a>
        <% }) %>
    </div>
</body>
</html>
```

-----

### Frontend: `views/presence.ejs`

This is your main dashboard. It connects to the WebSocket and sends heartbeats.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Presence Dashboard</title>
    <style>
        body { font-family: sans-serif; background: #f9f9f9; padding: 20px; }
        h1 { margin-top: 0; }
        h2 { border-bottom: 2px solid #eee; padding-bottom: 5px; }
        #user-list { list-style: none; padding: 0; }
        .user-item { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #fff; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; }
        .user-name { font-weight: 600; font-size: 1.1rem; }
        .user-status { font-size: 0.9rem; }
        .status-online { color: #28a745; font-weight: 700; }
        .status-offline { color: #6c757d; }
    </style>
</head>
<body>
    <h1>Presence Dashboard</h1>
    <p>You are logged in as: <strong><%= myName %></strong> (ID: <%= myUserId %>)</p>
    <h3 id="ws-status">Connecting to server...</h3>

    <h2>All Users</h2>
    <ul id="user-list">
        </ul>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            // Get user ID from EJS
            const MY_USER_ID = '<%= myUserId %>';
            // Get initial user data from EJS
            let initialUsers = <%- JSON.stringify(users) %>;

            const userListEl = document.getElementById('user-list');
            const wsStatusEl = document.getElementById('ws-status');
            let ws;
            let heartbeatInterval;
            
            // Function to format the "last_seen" timestamp
            function formatLastSeen(isoString) {
                if (!isoString) return '';
                const date = new Date(isoString);
                return `Last seen at ${date.toLocaleTimeString()}`;
            }

            // Function to re-render the entire user list
            function renderUserList(users) {
                userListEl.innerHTML = ''; // Clear the list
                users.forEach(user => {
                    // Don't show ourself in the list
                    if (user.id === MY_USER_ID) return;

                    const li = document.createElement('li');
                    li.className = 'user-item';
                    
                    const statusClass = user.isOnline ? 'status-online' : 'status-offline';
                    const statusText = user.isOnline ? 'Online' : formatLastSeen(user.last_seen);
                    
                    li.innerHTML = `
                        <span class="user-name">${user.name}</span>
                        <span class="user-status ${statusClass}">
                            ${statusText}
                        </span>
                    `;
                    userListEl.appendChild(li);
                });
            }
            
            function connectWebSocket() {
                const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
                // Pass our userId to the server for identification
                ws = new WebSocket(`${wsProtocol}://${window.location.host}/?userId=${MY_USER_ID}`);

                ws.onopen = () => {
                    console.log('WebSocket connection established.');
                    wsStatusEl.textContent = 'Connected ✅';
                    
                    // --- This is the Client-Side Heartbeat ---
                    // Send a 'ping' to the server every 10 seconds
                    if (heartbeatInterval) clearInterval(heartbeatInterval);
                    heartbeatInterval = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'heartbeat_ping' }));
                        }
                    }, 10000); // Must be less than the server's HEARTBEAT_TIMEOUT
                };

                ws.onmessage = (event) => {
                    const payload = JSON.parse(event.data);

                    // Server sent a full update of all user statuses
                    if (payload.type === 'presence_update') {
                        renderUserList(payload.users);
                    }
                    
                    if (payload.type === 'heartbeat_pong') {
                        // console.log('Heartbeat pong received.'); // Good for debugging
                    }
                };

                ws.onclose = () => {
                    console.log('WebSocket connection closed.');
                    wsStatusEl.textContent = 'Disconnected ❌. Retrying in 3 seconds...';
                    if (heartbeatInterval) clearInterval(heartbeatInterval);
                    // Simple reconnect logic
                    setTimeout(connectWebSocket, 3000);
                };

                ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    wsStatusEl.textContent = 'Connection Error ❌';
                    ws.close(); // This will trigger the 'onclose' event and retry
                };
            }
            
            // --- Initial Setup ---
            renderUserList(initialUsers); // Render the initial list passed from the server
            connectWebSocket(); // Start the real-time connection
        });
    </script>
</body>
</html>
```

### How to Run This Code

1.  **Create a Project Folder:**

    ```bash
    mkdir whatsapp-presence
    cd whatsapp-presence
    ```

2.  **Initialize npm and Install Dependencies:**

    ```bash
    npm init -y
    npm install express ejs ws
    ```

3.  **Create Folders and Files:**

      * Create a file named `app.js` (paste the backend code).
      * Create a folder named `views`.
      * Inside `views`, create `login.ejs` (paste the login page code).
      * Inside `views`, create `presence.ejs` (paste the dashboard page code).

4.  **Your folder structure:**

    ```
    whatsapp-presence/
    ├── app.js
    ├── package.json
    ├── node_modules/
    └── views/
        ├── login.ejs
        └── presence.ejs
    ```

5.  **Run the Server:**

    ```bash
    node app.js
    ```

### How to Test It

1.  Open your browser and go to `http://localhost:3000`.
2.  You'll see the login page. Click "Log in as Aditya".
3.  You are now on the dashboard. You'll see "Jane" and "Mike" listed as offline (their "Last seen" will be empty since the server just started).
4.  **Open a new incognito window** (or a different browser) and go to `http://localhost:3000`.
5.  Click "Log in as Jane".
6.  **Instantly**, in your "Aditya" window, you will see Jane's status change to "**Online**".
7.  Now, **close the incognito window** (where Jane is logged in).
8.  Within a second, in your "Aditya" window, you will see Jane's status change to "**Last seen at [current time]**".
9.  This proves the "Online" (connect) and "Last Seen" (disconnect) logic is working perfectly. The heartbeat logic will handle any network drops you don't simulate.