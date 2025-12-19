// src/controllers/orders.controller.js
const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const { generateOrderNumber } = require('../services/orderNumber.service');
const { updateProductStock } = require('../services/stock.service');
const log = require('../utils/logger');
const socketService = require('../utils/socketService'); // Add this

// Helper function to get pending order count
const getPendingOrderCount = async () => {
    try {
        const [result] = await promisePool.query(
            "SELECT COUNT(*) as count FROM orders WHERE status = 'pending' AND deleted_at IS NULL"
        );
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
        log.debug('Query params', { status, date, table_id });

        let query = `
            SELECT o.*, 
                   rt.table_number, 
                   u.full_name as cashier_name,
                   (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
            FROM orders o
            LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.deleted_at IS NULL
        `;
        const params = [];

        if (status) {
            query += ' AND o.status = ?';
            params.push(status);
        }

        if (date) {
            query += ' AND DATE(o.created_at) = ?';
            params.push(date);
        }

        if (table_id) {
            query += ' AND o.table_id = ?';
            params.push(table_id);
        }

        query += ' ORDER BY o.created_at DESC';

        log.db(query, params);
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
        log.info('=== GET ORDER BY ID ===');
        const { id } = req.params;
        log.debug('Fetching order', { orderId: id });

        // Get order details
        log.db('SELECT order with joins', [id]);
        const [orders] = await promisePool.query(
            `SELECT o.*, 
                    rt.table_number, rt.capacity as table_capacity, rt.location as table_location,
                    u.full_name as cashier_name, u.username as cashier_username
             FROM orders o
             LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
             LEFT JOIN users u ON o.user_id = u.id
             WHERE o.id = ? AND o.deleted_at IS NULL`,
            [id]
        );

        if (orders.length === 0) {
            log.warn('Order not found', { orderId: id });
            return sendError(res, 'Order not found', 404);
        }

        log.debug('Order found', { orderNumber: orders[0].order_number });

        // Get order items
        log.db('SELECT order_items', [id]);
        const [items] = await promisePool.query(
            `SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC`,
            [id]
        );

        log.debug(`Found ${items.length} items in order`);

        const order = {
            ...orders[0],
            items
        };

        log.success('Order retrieved successfully', { orderId: id, itemCount: items.length });
        sendSuccess(res, order, 'Order retrieved successfully');

    } catch (error) {
        log.error('Get order error', error);
        sendError(res, 'Failed to retrieve order', 500);
    }
};

// Get pending orders count (API endpoint)
const getPendingOrderCountAPI = async (req, res) => {
    try {
        log.info('=== GET PENDING ORDER COUNT ===');
        const count = await getPendingOrderCount();
        log.success(`Pending orders count: ${count}`);
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
        log.debug('Transaction started');

        const { table_id, items, notes } = req.body;
        const user_id = req.user.id;

        log.debug('Order data', {
            tableId: table_id,
            itemCount: items.length,
            userId: user_id
        });

        // Generate order number
        const order_number = await generateOrderNumber();
        log.debug('Order number generated', { orderNumber: order_number });

        // Create order
        log.db('INSERT order', [order_number, table_id, user_id]);
        const [orderResult] = await connection.query(
            `INSERT INTO orders (order_number, table_id, user_id, status, notes) 
             VALUES (?, ?, ?, 'pending', ?)`,
            [order_number, table_id, user_id, notes || null]
        );

        const orderId = orderResult.insertId;
        log.success('Order created', { orderId, orderNumber: order_number });

        // Add order items and calculate totals
        let subtotal = 0;
        log.debug('Adding order items...');

        for (const item of items) {
            const itemSubtotal = item.unit_price * item.quantity;
            const itemTotal = itemSubtotal - (item.discount_amount || 0);

            log.debug('Adding item', {
                productId: item.product_id,
                name: item.product_name,
                quantity: item.quantity,
                total: itemTotal
            });

            await connection.query(
                `INSERT INTO order_items 
                (order_id, product_id, product_name, product_image, quantity, unit_price, subtotal, discount_amount, total, notes) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, item.product_id, item.product_name, item.product_image, item.quantity, item.unit_price, itemSubtotal, item.discount_amount || 0, itemTotal, item.notes || null]
            );

            subtotal += itemTotal;
        }

        log.debug('All items added', { itemCount: items.length, subtotal });

        // Calculate tax and total
        const tax_rate = 10;
        const tax_amount = subtotal * (tax_rate / 100);
        const total = subtotal + tax_amount;

        log.debug('Calculations', { subtotal, taxRate: tax_rate, taxAmount: tax_amount, total });

        // Update order totals
        log.db('UPDATE order totals', [subtotal, tax_rate, tax_amount, total, orderId]);
        await connection.query(
            `UPDATE orders SET 
             subtotal = ?, tax_rate = ?, tax_amount = ?, total = ? 
             WHERE id = ?`,
            [subtotal, tax_rate, tax_amount, total, orderId]
        );

        // Update table status
        if (table_id) {
            log.debug('Updating table status', { tableId: table_id, status: 'occupied' });
            await connection.query(
                'UPDATE restaurant_tables SET status = ? WHERE id = ?',
                ['occupied', table_id]
            );
        }

        await connection.commit();
        log.success('Transaction committed');

        // Fetch complete order
        const [newOrder] = await connection.query(
            `SELECT o.*, 
                    rt.table_number,
                    u.full_name as cashier_name,
                    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
             FROM orders o
             LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
             LEFT JOIN users u ON o.user_id = u.id
             WHERE o.id = ?`,
            [orderId]
        );

        // Get order items
        const [orderItems] = await connection.query(
            'SELECT * FROM order_items WHERE order_id = ?',
            [orderId]
        );

        const completeOrder = {
            ...newOrder[0],
            items: orderItems
        };

        // Get updated pending count
        const pendingCount = await getPendingOrderCount();

        // 🔥 Broadcast to all clients via Socket.IO
        socketService.broadcastOrderCreated(completeOrder, pendingCount);

        log.success(`Order created successfully: ${order_number}`, {
            orderId,
            total,
            itemCount: items.length,
            pendingCount
        });

        sendSuccess(res, completeOrder, 'Order created successfully', 201);

    } catch (error) {
        await connection.rollback();
        log.error('Create order failed - Transaction rolled back', error);
        sendError(res, 'Failed to create order', 500);
    } finally {
        connection.release();
        log.debug('Database connection released');
    }
};

// Update order
const updateOrder = async (req, res) => {
    const connection = await promisePool.getConnection();

    try {
        log.info('=== UPDATE ORDER ===');
        await connection.beginTransaction();
        log.debug('Transaction started');

        const { id } = req.params;
        const { table_id, items, notes } = req.body;

        log.debug('Update order data', { orderId: id, itemCount: items.length });

        // Check if order exists and is pending
        const [existing] = await connection.query(
            'SELECT id, status, order_number FROM orders WHERE id = ? AND deleted_at IS NULL',
            [id]
        );

        if (existing.length === 0) {
            log.warn('Order not found for update', { orderId: id });
            return sendError(res, 'Order not found', 404);
        }

        log.debug('Order found', { orderNumber: existing[0].order_number, status: existing[0].status });

        if (existing[0].status !== 'pending') {
            log.warn('Cannot update non-pending order', { orderId: id, status: existing[0].status });
            return sendError(res, 'Cannot update completed or cancelled order', 400);
        }

        // Delete existing items
        log.debug('Deleting existing order items', { orderId: id });
        await connection.query('DELETE FROM order_items WHERE order_id = ?', [id]);

        // Add new items and calculate totals
        let subtotal = 0;
        log.debug('Adding new order items...');

        for (const item of items) {
            const itemSubtotal = item.unit_price * item.quantity;
            const itemTotal = itemSubtotal - (item.discount_amount || 0);

            log.debug('Adding item', {
                productId: item.product_id,
                name: item.product_name,
                quantity: item.quantity
            });

            await connection.query(
                `INSERT INTO order_items 
                (order_id, product_id, product_name, product_image, quantity, unit_price, subtotal, discount_amount, total, notes) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, item.product_id, item.product_name, item.product_image, item.quantity, item.unit_price, itemSubtotal, item.discount_amount || 0, itemTotal, item.notes || null]
            );

            subtotal += itemTotal;
        }

        // Calculate tax and total
        const tax_rate = 10;
        const tax_amount = subtotal * (tax_rate / 100);
        const total = subtotal + tax_amount;

        log.debug('Recalculated totals', { subtotal, taxAmount: tax_amount, total });

        // Update order
        log.db('UPDATE order', [table_id, subtotal, tax_amount, total, notes, id]);
        await connection.query(
            `UPDATE orders SET 
             table_id = ?, subtotal = ?, tax_amount = ?, total = ?, notes = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [table_id, subtotal, tax_amount, total, notes, id]
        );

        await connection.commit();
        log.success('Transaction committed');

        // Fetch updated order
        const [updatedOrder] = await connection.query(
            `SELECT o.*, 
                    rt.table_number,
                    u.full_name as cashier_name,
                    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
             FROM orders o
             LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
             LEFT JOIN users u ON o.user_id = u.id
             WHERE o.id = ?`,
            [id]
        );

        // Get order items
        const [orderItems] = await connection.query(
            'SELECT * FROM order_items WHERE order_id = ?',
            [id]
        );

        const completeOrder = {
            ...updatedOrder[0],
            items: orderItems
        };

        // Get updated pending count
        const pendingCount = await getPendingOrderCount();

        // 🔥 Broadcast to all clients via Socket.IO
        socketService.broadcastOrderUpdated(completeOrder, pendingCount);

        log.success(`Order updated successfully`, { orderId: id, itemCount: items.length, pendingCount });

        sendSuccess(res, completeOrder, 'Order updated successfully');

    } catch (error) {
        await connection.rollback();
        log.error('Update order failed - Transaction rolled back', error);
        sendError(res, 'Failed to update order', 500);
    } finally {
        connection.release();
        log.debug('Database connection released');
    }
};

// Complete order (process payment)
const completeOrder = async (req, res) => {
    const connection = await promisePool.getConnection();

    try {
        log.info('=== COMPLETE ORDER ===');
        await connection.beginTransaction();
        log.debug('Transaction started');

        const { id } = req.params;
        const { payment_method, amount_received } = req.body;
        const user_id = req.user.id;

        log.debug('Payment data', { orderId: id, paymentMethod: payment_method, amountReceived: amount_received });

        // Get order details
        const [orders] = await connection.query(
            'SELECT id, table_id, total, status, order_number FROM orders WHERE id = ? AND deleted_at IS NULL',
            [id]
        );

        if (orders.length === 0) {
            log.warn('Order not found for completion', { orderId: id });
            return sendError(res, 'Order not found', 404);
        }

        const order = orders[0];
        log.debug('Order details', { orderNumber: order.order_number, status: order.status, total: order.total });

        if (order.status !== 'pending') {
            log.warn('Cannot complete non-pending order', { orderId: id, status: order.status });
            return sendError(res, 'Order is not pending', 400);
        }

        const change_amount = amount_received - order.total;
        log.debug('Change calculated', { changeAmount: change_amount });

        // Update order status
        log.db('UPDATE order status to completed', [payment_method, id]);
        await connection.query(
            `UPDATE orders SET 
             status = 'completed', 
             payment_status = 'paid', 
             payment_method = ?, 
             completed_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [payment_method, id]
        );

        // Create payment record
        log.db('INSERT payment record', [id, payment_method, order.total]);
        await connection.query(
            `INSERT INTO payments 
            (order_id, payment_method, amount, amount_received, change_amount, status, processed_by) 
            VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
            [id, payment_method, order.total, amount_received, change_amount, user_id]
        );

        // Update table status
        if (order.table_id) {
            log.debug('Freeing table', { tableId: order.table_id });
            await connection.query(
                'UPDATE restaurant_tables SET status = ? WHERE id = ?',
                ['available', order.table_id]
            );
        }

        // Get order items and update stock
        const [items] = await connection.query(
            'SELECT product_id, product_name, quantity FROM order_items WHERE order_id = ?',
            [id]
        );

        log.debug(`Updating stock for ${items.length} items`);

        for (const item of items) {
            log.debug('Reducing stock', {
                productId: item.product_id,
                productName: item.product_name,
                quantity: item.quantity
            });

            await updateProductStock(
                item.product_id,
                -item.quantity,
                'out',
                'order',
                id,
                user_id,
                `Sale: ${item.product_name} x${item.quantity}`
            );
        }

        await connection.commit();
        log.success('Transaction committed');

        // Get updated pending count
        const pendingCount = await getPendingOrderCount();

        // 🔥 Broadcast to all clients via Socket.IO
        socketService.broadcastOrderStatusUpdated(id, 'completed', order, pendingCount);

        log.success(`Order completed: ${order.order_number}`, {
            orderId: id,
            total: order.total,
            paymentMethod: payment_method,
            change: change_amount,
            pendingCount
        });

        sendSuccess(res, { order_id: id, change: change_amount, pendingOrderCount: pendingCount }, 'Order completed successfully');

    } catch (error) {
        await connection.rollback();
        log.error('Complete order failed - Transaction rolled back', error);
        sendError(res, 'Failed to complete order', 500);
    } finally {
        connection.release();
        log.debug('Database connection released');
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

        log.debug('Cancel order request', { orderId: id, userId: user_id, reason });

        // Get order
        const [orders] = await connection.query(
            'SELECT id, table_id, status, order_number FROM orders WHERE id = ? AND deleted_at IS NULL',
            [id]
        );

        if (orders.length === 0) {
            log.warn('Order not found for cancellation', { orderId: id });
            return sendError(res, 'Order not found', 404);
        }

        const order = orders[0];
        log.debug('Order found', { orderNumber: order.order_number, status: order.status });

        if (order.status === 'completed') {
            log.warn('Cannot cancel completed order', { orderId: id });
            return sendError(res, 'Cannot cancel completed order', 400);
        }

        // Update order status
        log.db('UPDATE order status to cancelled', [user_id, reason, id]);
        await connection.query(
            `UPDATE orders SET 
             status = 'cancelled', 
             cancelled_at = CURRENT_TIMESTAMP,
             notes = CONCAT(COALESCE(notes, ''), '\n[CANCELLED by user_id:', ?, '] ', ?)
             WHERE id = ?`,
            [user_id, reason || 'No reason provided', id]
        );

        // Update table status
        if (order.table_id) {
            log.debug('Freeing table', { tableId: order.table_id });
            await connection.query(
                'UPDATE restaurant_tables SET status = ? WHERE id = ?',
                ['available', order.table_id]
            );
        }

        await connection.commit();
        log.success('Transaction committed');

        // Get updated pending count
        const pendingCount = await getPendingOrderCount();

        // 🔥 Broadcast to all clients via Socket.IO
        socketService.broadcastOrderStatusUpdated(id, 'cancelled', order, pendingCount);

        log.success(`Order cancelled: ${order.order_number}`, { orderId: id, pendingCount });

        sendSuccess(res, { pendingOrderCount: pendingCount }, 'Order cancelled successfully');

    } catch (error) {
        await connection.rollback();
        log.error('Cancel order failed - Transaction rolled back', error);
        sendError(res, 'Failed to cancel order', 500);
    } finally {
        connection.release();
        log.debug('Database connection released');
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