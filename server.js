// server.js
const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const { testConnection } = require('./src/config/database');
const log = require('./src/utils/logger');
const socketService = require('./src/utils/socketService');

const PORT = process.env.PORT || 5000;

// Test database connection
testConnection();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Initialize socket service
socketService.initialize(io);

// Store connected clients
let connectedClients = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  const clientInfo = {
    id: socket.id,
    connectedAt: new Date(),
    ip: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent']
  };
  
  connectedClients.set(socket.id, clientInfo);
  
  log.info(`🔌 Client connected: ${socket.id} (Total: ${connectedClients.size})`);
  log.info(`   IP: ${clientInfo.ip}`);

  // Send initial connection success
  socket.emit('connection-success', {
    socketId: socket.id,
    timestamp: new Date().toISOString(),
    message: 'Connected to POS server successfully',
    serverTime: new Date().toISOString()
  });

  // Handle user identification (optional - if you want to track which user is connected)
  socket.on('identify', (data) => {
    const client = connectedClients.get(socket.id);
    if (client) {
      client.userId = data.userId;
      client.username = data.username;
      log.info(`👤 Client ${socket.id} identified as: ${data.username}`);
    }
  });

  // Handle ping from client
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  });

  // Handle client disconnect
  socket.on('disconnect', (reason) => {
    const client = connectedClients.get(socket.id);
    const username = client?.username || 'Unknown';
    
    connectedClients.delete(socket.id);
    
    log.info(`🔌 Client disconnected: ${socket.id} (${username})`);
    log.info(`   Reason: ${reason}`);
    log.info(`   Total clients: ${connectedClients.size}`);
  });

  // Handle errors
  socket.on('error', (error) => {
    log.error(`Socket error for ${socket.id}:`, error);
  });

  // Handle connection errors
  socket.on('connect_error', (error) => {
    log.error('Socket connection error:', error);
  });
});

// Handle Socket.IO engine errors
io.engine.on('connection_error', (err) => {
  log.error('Socket.IO connection error:');
  log.error(`  Code: ${err.code}`);
  log.error(`  Message: ${err.message}`);
  log.error(`  Context: ${JSON.stringify(err.context)}`);
});

// Make io accessible throughout the app
app.set('io', io);

// Add endpoint to check connected clients (for debugging)
app.get(`${process.env.API_PREFIX || '/api/v1'}/socket/status`, (req, res) => {
  const clients = Array.from(connectedClients.values()).map(client => ({
    id: client.id,
    userId: client.userId,
    username: client.username,
    connectedAt: client.connectedAt,
    ip: client.ip
  }));

  res.json({
    success: true,
    connectedClients: connectedClients.size,
    clients: clients,
    uptime: process.uptime()
  });
});

// Start server
server.listen(PORT, () => {
  log.info(`🚀 Server is running on port ${PORT}`);
  log.info(`📡 Socket.IO enabled and ready`);
  log.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  log.info(`🔗 API URL: http://localhost:${PORT}${process.env.API_PREFIX || '/api/v1'}`);
  log.info(`🔌 WebSocket URL: ws://localhost:${PORT}`);
});

// Graceful shutdown
const gracefulShutdown = () => {
  log.info('📴 Received shutdown signal, closing server gracefully...');
  
  // Close Socket.IO connections
  io.close(() => {
    log.info('🔌 Socket.IO connections closed');
  });
  
  // Close HTTP server
  server.close(() => {
    log.info('🚀 HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    log.error('⚠️ Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('❌ Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('❌ Unhandled Rejection at:', promise);
  log.error('Reason:', reason);
});

module.exports = { server, io };