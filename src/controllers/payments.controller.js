const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');

// Get all payments
const getAllPayments = async (req, res) => {
    try {
        const { date, payment_method, status } = req.query;

        let query = `
            SELECT p.*, 
                   o.order_number, 
                   u.full_name as processed_by_name
            FROM payments p
            LEFT JOIN orders o ON p.order_id = o.id
            LEFT JOIN users u ON p.processed_by = u.id
            WHERE 1=1
        `;
        const params = [];

        if (date) {
            query += ' AND DATE(p.created_at) = ?';
            params.push(date);
        }

        if (payment_method) {
            query += ' AND p.payment_method = ?';
            params.push(payment_method);
        }

        if (status) {
            query += ' AND p.status = ?';
            params.push(status);
        }

        query += ' ORDER BY p.created_at DESC';

        const [payments] = await promisePool.query(query, params);

        sendSuccess(res, payments, 'Payments retrieved successfully');

    } catch (error) {
        log.error('Get payments error:', error);
        sendError(res, 'Failed to retrieve payments', 500);
    }
};

// Get payment by ID
const getPaymentById = async (req, res) => {
    try {
        const { id } = req.params;

        const [payments] = await promisePool.query(
            `SELECT p.*, 
                    o.order_number, o.total as order_total,
                    u.full_name as processed_by_name
             FROM payments p
             LEFT JOIN orders o ON p.order_id = o.id
             LEFT JOIN users u ON p.processed_by = u.id
             WHERE p.id = ?`,
            [id]
        );

        if (payments.length === 0) {
            return sendError(res, 'Payment not found', 404);
        }

        sendSuccess(res, payments[0], 'Payment retrieved successfully');

    } catch (error) {
        log.error('Get payment error:', error);
        sendError(res, 'Failed to retrieve payment', 500);
    }
};

// Get payments by order ID
const getPaymentsByOrderId = async (req, res) => {
    try {
        const { orderId } = req.params;

        const [payments] = await promisePool.query(
            `SELECT p.*, u.full_name as processed_by_name
             FROM payments p
             LEFT JOIN users u ON p.processed_by = u.id
             WHERE p.order_id = ?
             ORDER BY p.created_at DESC`,
            [orderId]
        );

        sendSuccess(res, payments, 'Payments retrieved successfully');

    } catch (error) {
        log.error('Get payments by order error:', error);
        sendError(res, 'Failed to retrieve payments', 500);
    }
};

// Refund payment
const refundPayment = async (req, res) => {
    const connection = await promisePool.getConnection();

    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { reason, refund_amount } = req.body;
        const user_id = req.user.id;

        // Get payment details
        const [payments] = await connection.query(
            'SELECT * FROM payments WHERE id = ?',
            [id]
        );

        if (payments.length === 0) {
            return sendError(res, 'Payment not found', 404);
        }

        const payment = payments[0];

        if (payment.status === 'refunded') {
            return sendError(res, 'Payment already refunded', 400);
        }

        const amount_to_refund = refund_amount || payment.amount;

        // Update payment status
        await connection.query(
            `UPDATE payments SET 
             status = 'refunded',
             notes = CONCAT(COALESCE(notes, ''), '\n[REFUNDED by user_id:', ?, '] Amount: ', ?, ' Reason: ', ?),
             updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [user_id, amount_to_refund, reason || 'No reason provided', id]
        );

        // Update order payment status
        await connection.query(
            `UPDATE orders SET 
             payment_status = 'refunded',
             updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [payment.order_id]
        );

        await connection.commit();

        log.info(`Payment refunded: ID ${id}, Amount: ${amount_to_refund}`);

        sendSuccess(res, { payment_id: id, refund_amount: amount_to_refund }, 'Payment refunded successfully');

    } catch (error) {
        await connection.rollback();
        log.error('Refund payment error:', error);
        sendError(res, 'Failed to refund payment', 500);
    } finally {
        connection.release();
    }
};

module.exports = {
    getAllPayments,
    getPaymentById,
    getPaymentsByOrderId,
    refundPayment
};