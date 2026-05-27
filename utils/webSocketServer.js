/**
 * webSocketServer.js — DEPRECATED
 *
 * WebSocket-based real-time presence has been replaced by Firebase Realtime Database.
 * This file is kept as a stub so existing require() calls do not crash the server.
 * No actual WebSocket server is started.
 */

const noop = () => {};
const noopAsync = async () => null;

module.exports = {
    initializeWebSocketServer: () => ({
        on: noop,
        clients: new Set()
    }),
    broadcastUpdate: noop,
    getAllUserStatuses: noopAsync,
    getUserStatusCounts: noopAsync,
    getOnlineUsers: () => [],
    getUserActivityStats: () => ({ online: 0, idle: 0, total: 0, recentActivity: [] }),
    disconnectUser: () => false,
};