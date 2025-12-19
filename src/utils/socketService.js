// src/utils/socketService.js
const log = require('./logger');

class SocketService {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize Socket.IO instance
   * @param {Server} io - Socket.IO server instance
   */
  initialize(io) {
    if (this.io) {
      log.warn('⚠️ Socket service already initialized');
      return;
    }
    this.io = io;
    log.info('✅ Socket service initialized successfully');
  }

  /**
   * Check if Socket.IO is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.io !== null;
  }

  /**
   * Emit event to all connected clients
   * @param {string} event - Event name
   * @param {object} data - Data to send
   */
  emitToAll(event, data) {
    if (!this.isInitialized()) {
      log.error('❌ Socket.IO not initialized - cannot emit event');
      return;
    }

    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
      event: event
    };

    this.io.emit(event, payload);
    log.info(`📡 Broadcasted event: ${event} to all clients`);
    log.debug(`   Data:`, payload);
  }

  /**
   * Emit event to specific room
   * @param {string} room - Room name
   * @param {string} event - Event name
   * @param {object} data - Data to send
   */
  emitToRoom(room, event, data) {
    if (!this.isInitialized()) {
      log.error('❌ Socket.IO not initialized - cannot emit to room');
      return;
    }

    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
      event: event
    };

    this.io.to(room).emit(event, payload);
    log.info(`📡 Emitted event: ${event} to room: ${room}`);
  }

  /**
   * Emit event to specific socket by ID
   * @param {string} socketId - Socket ID
   * @param {string} event - Event name
   * @param {object} data - Data to send
   */
  emitToSocket(socketId, event, data) {
    if (!this.isInitialized()) {
      log.error('❌ Socket.IO not initialized - cannot emit to socket');
      return;
    }

    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
      event: event
    };

    this.io.to(socketId).emit(event, payload);
    log.info(`📡 Emitted event: ${event} to socket: ${socketId}`);
  }

  /**
   * Get number of connected clients
   * @returns {number}
   */
  getClientsCount() {
    if (!this.isInitialized()) {
      return 0;
    }
    return this.io.engine.clientsCount || 0;
  }

  /**
   * Broadcast order events
   */
  broadcastOrderCreated(order, pendingCount) {
    this.emitToAll('order-created', {
      order,
      pendingOrderCount: pendingCount,
      action: 'CREATE',
      message: `New order #${order.id} created`
    });
  }

  broadcastOrderUpdated(order, pendingCount) {
    this.emitToAll('order-updated', {
      order,
      pendingOrderCount: pendingCount,
      action: 'UPDATE',
      message: `Order #${order.id} updated`
    });
  }

  broadcastOrderStatusUpdated(orderId, status, order, pendingCount) {
    this.emitToAll('order-status-updated', {
      orderId,
      status,
      order,
      pendingOrderCount: pendingCount,
      action: 'UPDATE_STATUS',
      message: `Order #${orderId} status changed to ${status}`
    });
  }

  broadcastOrderDeleted(orderId, pendingCount) {
    this.emitToAll('order-deleted', {
      orderId,
      pendingOrderCount: pendingCount,
      action: 'DELETE',
      message: `Order #${orderId} deleted`
    });
  }

  /**
   * Broadcast table events
   */
  broadcastTableStatusChanged(tableId, status) {
    this.emitToAll('table-status-changed', {
      tableId,
      status,
      message: `Table #${tableId} status changed to ${status}`
    });
  }

  /**
   * Broadcast payment events
   */
  broadcastPaymentReceived(payment) {
    this.emitToAll('payment-received', {
      payment,
      message: `Payment received for order #${payment.order_id}`
    });
  }
}

module.exports = new SocketService();