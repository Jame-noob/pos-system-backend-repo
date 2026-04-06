// src/controllers/orders.controller.js
const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const { generateOrderNumber } = require('../services/orderNumber.service');
const { updateProductStock } = require('../services/stock.service');
const log = require('../utils/logger');
const socketService = require('../utils/socketService');

// Helper function to get pending order count for a merchant
const getPendingOrderCount = async (merchantId) => {
    try {
        const query = merchantId
            ? "SELECT COUNT(*) as count FROM orders WHERE status = 'pending' AND deleted_at IS NULL AND merchant_id = ?"
            : "SELECT COUNT(*) as count FROM orders WHERE status = 'pending' AND deleted_at IS NULL";
        const params = merchantId ? [merchantId] : [];
        const [result] = await promisePool.query(query, params);
        return result[0]?.count || 0;
    } catch (error) {
        log.error('Error getting pending order count:', error);
        return 0;
    }
};

// Get all orders
const getAllOrders = async (req, res) => {
    try {
        log.info('=== GET ALL ORDERS ===');
        const { status, date, table_id } = req.query;
        const merchantId = req.user.merchant_id;

        let query = `
            SELECT o.*,
                   rt.table_number, rt.table_name,
                   u.full_name as cashier_name,
                   (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
            FROM orders o
            LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.deleted_at IS NULL AND o.merchant_id = ?
        `;
        const params = [merchantId];

        if (status) { query += ' AND o.status = ?'; params.push(status); }
        if (date)   { query += ' AND DATE(o.created_at) = ?'; params.push(date); }
        if (table_id) { query += ' AND o.table_id = ?'; params.push(table_id); }

        query += ' ORDER BY o.created_at DESC';

        const [orders] = await promisePool.query(query, params);
        log.success(`Retrieved ${orders.length} orders`);
        sendSuccess(res, orders, 'Orders retrieved successfully');
    } catch (error) {
        log.error('Get orders error', error);
        sendError(res, 'Failed to retrieve orders', 500);
    }
};

// Get order by ID with items
const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantId = req.user.merchant_id;

        const [orders] = await promisePool.query(
            `SELECT o.*,
                    rt.table_number, rt.table_name, rt.capacity as table_capacity, rt.location as table_location,
                    u.full_name as cashier_name, u.username as cashier_username
             FROM orders o
             LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
             LEFT JOIN users u ON o.user_id = u.id
             WHERE o.id = ? AND o.merchant_id = ? AND o.deleted_at IS NULL`,
            [id, merchantId]
        );

        if (orders.length === 0) {
            return sendError(res, 'Order not found', 404);
        }

        const [items] = await promisePool.query(
            'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
            [id]
        );

        sendSuccess(res, { ...orders[0], items }, 'Order retrieved successfully');
    } catch (error) {
        log.error('Get order error', error);
        sendError(res, 'Failed to retrieve order', 500);
    }
};

// Get pending orders count (API endpoint)
const getPendingOrderCountAPI = async (req, res) => {
    try {
        const count = await getPendingOrderCount(req.user.merchant_id);
        sendSuccess(res, { count }, 'Pending order count retrieved successfully');
    } catch (error) {
        log.error('Get pending order count error', error);
        sendError(res, 'Failed to get pending order count', 500);
    }
};

// Create new order
const createOrder = async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        log.info('=== CREATE ORDER ===');
        await connection.beginTransaction();

        const { table_id, items, notes } = req.body;
        const user_id = req.user.id;
        const merchantId = req.user.merchant_id;

        const order_number = await generateOrderNumber();

        const [orderResult] = await connection.query(
            `INSERT INTO orders (order_number, table_id, user_id, status, notes, merchant_id)
             VALUES (?, ?, ?, 'pending', ?, ?)`,
            [order_number, table_id, user_id, notes || null, merchantId]
        );

        const orderId = orderResult.insertId;
        let subtotal = 0;

        for (const item of items) {
            const itemSubtotal = item.unit_price * item.quantity;
            const itemTotal = itemSubtotal - (item.discount_amount || 0);

            await connection.query(
                `INSERT INTO order_items
                (order_id, product_id, product_name, product_image, quantity, unit_price, subtotal, discount_amount, total, notes, merchant_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, item.product_id, item.product_name, item.product_image, item.quantity, item.unit_price, itemSubtotal, item.discount_amount || 0, itemTotal, item.notes || null, merchantId]
            );

            subtotal += itemTotal;
        }

        const tax_rate = 10;
        const tax_amount = subtotal * (tax_rate / 100);
        const total = subtotal + tax_amount;

        await connection.query(
            'UPDATE orders SET subtotal = ?, tax_rate = ?, tax_amount = ?, total = ? WHERE id = ?',
            [subtotal, tax_rate, tax_amount, total, orderId]
        );

        await connection.commit();

        const [newOrder] = await connection.query(
            `SELECT o.*, rt.table_number, rt.table_name, u.full_name as cashier_name,
                    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
             FROM orders o
             LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
             LEFT JOIN users u ON o.user_id = u.id
             WHERE o.id = ?`,
            [orderId]
        );

        const [orderItems] = await connection.query(
            'SELECT * FROM order_items WHERE order_id = ?', [orderId]
        );

        const completeOrder = { ...newOrder[0], items: orderItems };
        const pendingCount = await getPendingOrderCount(merchantId);
        socketService.broadcastOrderCreated(completeOrder, pendingCount);

        log.success(`Order created: ${order_number}`);
        sendSuccess(res, completeOrder, 'Order created successfully', 201);
    } catch (error) {
        await connection.rollback();
        log.error('Create order failed', error);
        sendError(res, 'Failed to create order', 500);
    } finally {
        connection.release();
    }
};

// Update order
const updateOrder = async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        log.info('=== UPDATE ORDER ===');
        await connection.beginTransaction();

        const { id } = req.params;
        const { table_id, items, notes } = req.body;
        const merchantId = req.user.merchant_id;

        const [existing] = await connection.query(
            'SELECT id, status, order_number FROM orders WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (existing.length === 0) return sendError(res, 'Order not found', 404);
        if (existing[0].status !== 'pending') return sendError(res, 'Cannot update completed or cancelled order', 400);

        await connection.query('DELETE FROM order_items WHERE order_id = ?', [id]);

        let subtotal = 0;
        for (const item of items) {
            const itemSubtotal = item.unit_price * item.quantity;
            const itemTotal = itemSubtotal - (item.discount_amount || 0);

            await connection.query(
                `INSERT INTO order_items
                (order_id, product_id, product_name, product_image, quantity, unit_price, subtotal, discount_amount, total, notes, merchant_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, item.product_id, item.product_name, item.product_image, item.quantity, item.unit_price, itemSubtotal, item.discount_amount || 0, itemTotal, item.notes || null, merchantId]
            );

            subtotal += itemTotal;
        }

        const tax_rate = 10;
        const tax_amount = subtotal * (tax_rate / 100);
        const total = subtotal + tax_amount;

        await connection.query(
            `UPDATE orders SET table_id = ?, subtotal = ?, tax_amount = ?, total = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND merchant_id = ?`,
            [table_id, subtotal, tax_amount, total, notes, id, merchantId]
        );

        await connection.commit();

        const [updatedOrder] = await connection.query(
            `SELECT o.*, rt.table_number, rt.table_name, u.full_name as cashier_name,
                    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
             FROM orders o
             LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
             LEFT JOIN users u ON o.user_id = u.id
             WHERE o.id = ?`,
            [id]
        );

        const [orderItems] = await connection.query(
            'SELECT * FROM order_items WHERE order_id = ?', [id]
        );

        const completeOrder = { ...updatedOrder[0], items: orderItems };
        const pendingCount = await getPendingOrderCount(merchantId);
        socketService.broadcastOrderUpdated(completeOrder, pendingCount);

        log.success(`Order updated`, { orderId: id });
        sendSuccess(res, completeOrder, 'Order updated successfully');
    } catch (error) {
        await connection.rollback();
        log.error('Update order failed', error);
        sendError(res, 'Failed to update order', 500);
    } finally {
        connection.release();
    }
};

// Complete order (process payment)
const completeOrder = async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        log.info('=== COMPLETE ORDER ===');
        await connection.beginTransaction();

        const { id } = req.params;
        const { payment_method, amount_received } = req.body;
        const user_id = req.user.id;
        const merchantId = req.user.merchant_id;

        const [orders] = await connection.query(
            'SELECT id, table_id, total, status, order_number FROM orders WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (orders.length === 0) return sendError(res, 'Order not found', 404);

        const order = orders[0];
        if (order.status !== 'pending') return sendError(res, 'Order is not pending', 400);

        const change_amount = amount_received - order.total;

        await connection.query(
            `UPDATE orders SET status = 'completed', payment_status = 'paid', payment_method = ?, completed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND merchant_id = ?`,
            [payment_method, id, merchantId]
        );

        await connection.query(
            `INSERT INTO payments (order_id, payment_method, amount, amount_received, change_amount, status, processed_by, merchant_id)
            VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)`,
            [id, payment_method, order.total, amount_received, change_amount, user_id, merchantId]
        );

        const [items] = await connection.query(
            'SELECT product_id, product_name, quantity FROM order_items WHERE order_id = ?',
            [id]
        );

        for (const item of items) {
            await updateProductStock(item.product_id, -item.quantity, 'out', 'order', id, user_id, `Sale: ${item.product_name} x${item.quantity}`, merchantId);
        }

        await connection.commit();

        const pendingCount = await getPendingOrderCount(merchantId);
        socketService.broadcastOrderStatusUpdated(id, 'completed', order, pendingCount);

        log.success(`Order completed: ${order.order_number}`);
        sendSuccess(res, { order_id: id, change: change_amount, pendingOrderCount: pendingCount }, 'Order completed successfully');
    } catch (error) {
        await connection.rollback();
        log.error('Complete order failed', error);
        sendError(res, 'Failed to complete order', 500);
    } finally {
        connection.release();
    }
};

// Cancel order
const cancelOrder = async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        log.info('=== CANCEL ORDER ===');
        await connection.beginTransaction();

        const { id } = req.params;
        const { reason } = req.body;
        const user_id = req.user.id;
        const merchantId = req.user.merchant_id;

        const [orders] = await connection.query(
            'SELECT id, table_id, status, order_number FROM orders WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (orders.length === 0) return sendError(res, 'Order not found', 404);

        const order = orders[0];
        if (order.status === 'completed') return sendError(res, 'Cannot cancel completed order', 400);

        await connection.query(
            `UPDATE orders SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP,
             notes = CONCAT(COALESCE(notes, ''), '\n[CANCELLED by user_id:', ?, '] ', ?)
             WHERE id = ? AND merchant_id = ?`,
            [user_id, reason || 'No reason provided', id, merchantId]
        );

        await connection.commit();

        const pendingCount = await getPendingOrderCount(merchantId);
        socketService.broadcastOrderStatusUpdated(id, 'cancelled', order, pendingCount);

        log.success(`Order cancelled: ${order.order_number}`);
        sendSuccess(res, { pendingOrderCount: pendingCount }, 'Order cancelled successfully');
    } catch (error) {
        await connection.rollback();
        log.error('Cancel order failed', error);
        sendError(res, 'Failed to cancel order', 500);
    } finally {
        connection.release();
    }
};

module.exports = {
    getAllOrders,
    getOrderById,
    getPendingOrderCountAPI,
    createOrder,
    updateOrder,
    completeOrder,
    cancelOrder
};
