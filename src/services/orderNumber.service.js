const { promisePool } = require('../config/database');
const log = require('../utils/logger');

const generateOrderNumber = async () => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const prefix = `ORD-${dateStr}-`;

    const connection = await promisePool.getConnection();
    try {
        await connection.beginTransaction();

        // Lock all today's order rows globally to prevent race conditions across merchants
        const [rows] = await connection.query(
            `SELECT order_number FROM orders
             WHERE order_number LIKE ?
             ORDER BY order_number DESC LIMIT 1
             FOR UPDATE`,
            [`${prefix}%`]
        );

        let sequence = 1;
        if (rows.length > 0) {
            const lastSeq = parseInt(rows[0].order_number.slice(prefix.length), 10);
            if (!isNaN(lastSeq)) sequence = lastSeq + 1;
        }

        const orderNumber = `${prefix}${sequence.toString().padStart(4, '0')}`;

        await connection.commit();

        log.debug('Order number generated', { orderNumber });
        return orderNumber;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = {
    generateOrderNumber
};
