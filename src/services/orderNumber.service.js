const { promisePool } = require('../config/database');
const log = require('../utils/logger');

const generateOrderNumber = async () => {
    log.debug('Generating order number...');

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    // Get today's order count
    const [rows] = await promisePool.query(
        `SELECT COUNT(*) as count FROM orders WHERE order_number LIKE ?`,
        [`ORD-${dateStr}-%`]
    );

    const sequence = (rows[0].count + 1).toString().padStart(4, '0');
    const orderNumber = `ORD-${dateStr}-${sequence}`;

    log.debug('Order number generated', {
        orderNumber,
        date: dateStr,
        sequence
    });

    return orderNumber;
};

module.exports = {
    generateOrderNumber
};