const WebSocket = require('ws');

let wssInstance;
const onlineUsers = new Map(); // socket -> { userId, username, role, connectedAt }

const initializeWebSocketServer = (server) => {
    const wss = new WebSocket.Server({ server });
    wssInstance = wss;

    wss.on('connection', (ws, req) => {
        console.log('Client connected via WebSocket');
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'HELLO' && data.user) {
                    const { _id, username, role } = data.user;
                    onlineUsers.set(ws, { userId: _id, username, role, connectedAt: new Date() });
                    broadcastActiveUsers();
                }
            } catch (_) {}
        });
        ws.on('close', () => {
            onlineUsers.delete(ws);
            console.log('Client disconnected');
            broadcastActiveUsers();
        });
    });

    // Keep-alive interval
    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping(() => {});
        });
    }, 50000); // Ping every 50 seconds

    wss.on('close', () => {
        clearInterval(interval);
    });

    return wss;
};

// Function to broadcast updates to all connected clients
const broadcastUpdate = (data) => {
    if (wssInstance) {
        const message = JSON.stringify({
            type: 'DATA_UPDATE',
            payload: data,
            timestamp: new Date()
        });

        wssInstance.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }
};

const broadcastActiveUsers = () => {
    if (!wssInstance) return;
    const users = Array.from(onlineUsers.values());
    const message = JSON.stringify({ type: 'ACTIVE_USERS', payload: users, timestamp: new Date() });
    wssInstance.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
    });
};

const getOnlineUsers = () => {
    return Array.from(onlineUsers.values());
};

module.exports = { initializeWebSocketServer, broadcastUpdate, broadcastActiveUsers, getOnlineUsers };