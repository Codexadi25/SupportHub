const WebSocket = require('ws');
const User = require('../models/User');

let wssInstance;
const liveConnections = new Map(); // userId -> { ws: WebSocket, heartbeatTimer: Timeout, lastActivity: number }

// Status definitions
const STATUS = {
    ONLINE: 'online',
    IDLE: 'idle', 
    ON_BREAK: 'on_break',
    UNRESPONSIVE: 'unresponsive',
    UNAVAILABLE: 'unavailable'
};

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT = HEARTBEAT_INTERVAL * 2; // 60 seconds
const IDLE_TIMEOUT = 3 * 60 * 1000; // 3 minutes

const initializeWebSocketServer = (server) => {
    const wss = new WebSocket.Server({ 
        server,
        verifyClient: (info) => {
            // For development, allow all origins
            if (process.env.NODE_ENV !== 'production') {
                return true;
            }
            
            const origin = info.origin;
            const allowedOrigins = [process.env.ALLOWED_ORIGIN || 'https://yourdomain.com'];
            return allowedOrigins.includes(origin);
        }
    });
    wssInstance = wss;

    wss.on('connection', (ws, req) => {
        // console.log('New WebSocket connection attempt');
        ws.isAlive = true;
        ws.userId = null;
        ws.lastActivity = Date.now();
        
        ws.on('pong', () => { 
            ws.isAlive = true; 
            ws.lastActivity = Date.now();
        });
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                
                if (data.type === 'HELLO' && data.user) {
                    handleUserHello(ws, data.user);
                } else if (data.type === 'ACTIVITY') {
                    handleUserActivity(ws);
                } else if (data.type === 'SET_STATUS') {
                    handleStatusChange(ws, data.status);
                }
            } catch (error) {
                console.error('WebSocket message error:', error);
                ws.send(JSON.stringify({ 
                    type: 'ERROR', 
                    message: 'Invalid message format' 
                }));
            }
        });
        
        ws.on('close', () => {
            handleUserDisconnect(ws);
        });
        
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });

    // Keep-alive interval
    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                return ws.terminate();
            }
            
            // Check for idle users
            if (ws.userId) {
                const connection = liveConnections.get(ws.userId);
                if (connection && (Date.now() - connection.lastActivity) > IDLE_TIMEOUT) {
                    setUserStatus(ws.userId, STATUS.IDLE);
                }
            }
            
            ws.isAlive = false;
            ws.ping(() => {});
        });
    }, HEARTBEAT_INTERVAL);

    wss.on('close', () => {
        clearInterval(interval);
    });

    return wss;
};

function handleUserHello(ws, userData) {
    const { _id, username, role } = userData;
    
    if (!_id || !username || !role) {
        ws.send(JSON.stringify({ 
            type: 'ERROR', 
            message: 'Invalid user data' 
        }));
        ws.close(1008, 'Invalid user data');
        return;
    }
    
    ws.userId = _id;
    ws.username = username;
    ws.role = role;
    ws.lastActivity = Date.now();
    
    // Add user to live connections
    liveConnections.set(_id, { 
        ws, 
        heartbeatTimer: null,
        lastActivity: Date.now(),
        username,
        role,
        status: STATUS.ONLINE
    });
    
    console.log(`User ${username} (${role}) connected via WebSocket`);
    
    // Start heartbeat
    startHeartbeat(_id);
    
    // Send welcome message
    ws.send(JSON.stringify({ 
        type: 'WELCOME', 
        userId: _id,
        message: 'Connected successfully'
    }));
    
    // Broadcast user list update
    broadcastUserList();
}

function handleUserActivity(ws) {
    if (!ws.userId) return;
    
    const connection = liveConnections.get(ws.userId);
    if (connection) {
        connection.lastActivity = Date.now();
        
        // If user was idle, mark them as online again
        if (connection.status === STATUS.IDLE) {
            setUserStatus(ws.userId, STATUS.ONLINE);
        }
    }
}

function handleStatusChange(ws, newStatus) {
    if (!ws.userId) return;
    
    if (Object.values(STATUS).includes(newStatus)) {
        setUserStatus(ws.userId, newStatus);
    }
}

function handleUserDisconnect(ws) {
    if (!ws.userId) return;
    
    const connection = liveConnections.get(ws.userId);
    if (connection && connection.heartbeatTimer) {
        clearTimeout(connection.heartbeatTimer);
    }
    
    liveConnections.delete(ws.userId);
    console.log(`User ${ws.username} disconnected from WebSocket`);
    broadcastUserList();
}

function startHeartbeat(userId) {
    const connection = liveConnections.get(userId);
    if (!connection) return;

    // Clear any old timer
    if (connection.heartbeatTimer) {
        clearTimeout(connection.heartbeatTimer);
    }

    // Set a new timer
    connection.heartbeatTimer = setTimeout(() => {
        console.log(`Heartbeat timeout for user ${userId}. Terminating connection.`);
        connection.ws.terminate();
    }, HEARTBEAT_TIMEOUT);
}

function setUserStatus(userId, newStatus) {
    const connection = liveConnections.get(userId);
    if (!connection) return;

    connection.status = newStatus;
    liveConnections.set(userId, connection);
    broadcastUserList();
}

function broadcastUserList() {
    if (!wssInstance) return;
    
    const users = Array.from(liveConnections.values()).map(connection => ({
        userId: connection.ws.userId,
        username: connection.username,
        role: connection.role,
        status: connection.status,
        lastActivity: connection.lastActivity
    }));
    
    const message = JSON.stringify({
        type: 'USER_LIST_UPDATE',
        users: users,
        timestamp: new Date().toISOString()
    });
    
    wssInstance.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error('Error sending message to client:', error);
            }
        }
    });
}

function broadcastUpdate(data) {
    if (!wssInstance) return;

    const message = JSON.stringify({
        type: 'BROADCAST_UPDATE',
        payload: data,
        timestamp: new Date().toISOString()
    });

    wssInstance.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (error) {
                console.error('Error broadcasting update to client:', error);
            }
        }
    });
}

function getAllUserStatuses() {
    const allUsers = [];
    
    // Get all users from database
    return User.find({}).select('_id username role').lean().then(users => {
        users.forEach(user => {
            const connection = liveConnections.get(String(user._id));
            const isOnline = !!connection;
            
            allUsers.push({
                userId: String(user._id),
                username: user.username,
                role: user.role,
                status: isOnline ? connection.status : STATUS.UNAVAILABLE,
                lastActivity: isOnline ? connection.lastActivity : null,
                isOnline: isOnline
            });
        });
        
        return allUsers;
    });
}

function getUserStatusCounts() {
    const counts = {
        online: 0,
        idle: 0,
        on_break: 0,
        unresponsive: 0,
        unavailable: 0,
        total: 0
    };
    
    liveConnections.forEach(connection => {
        counts[connection.status] = (counts[connection.status] || 0) + 1;
    });
    
    return User.countDocuments().then(totalUsers => {
        counts.total = totalUsers;
        counts.unavailable = totalUsers - liveConnections.size;
        return counts;
    });
}

function getOnlineUsers() {
    return Array.from(liveConnections.values()).map(connection => ({
        userId: connection.ws.userId,
        username: connection.username,
        role: connection.role,
        status: connection.status,
        lastActivity: connection.lastActivity
    }));
}

module.exports = { 
    initializeWebSocketServer, 
    broadcastUpdate,
    getAllUserStatuses,
    getUserStatusCounts,
    getOnlineUsers
};