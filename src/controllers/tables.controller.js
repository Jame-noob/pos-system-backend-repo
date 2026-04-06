const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');

// Get all tables
const getAllTables = async (req, res) => {
    try {
        const { status, location } = req.query;
        const merchantId = req.user.merchant_id;

        let query = `
            SELECT ta.* FROM (
                SELECT
                    t.id, t.table_number, t.table_name, t.capacity, t.location, t.is_active,
                    t.created_at, t.updated_at, t.deleted_at, t.display_order,
                    CASE
                        WHEN t.table_name like 'ຊື້ກັບບ້ານ%' or t.table_number like 'Take Away%' THEN 'available'
                        WHEN o.status IS NOT NULL THEN 'occupied'
                        ELSE 'available'
                    END AS status
                FROM restaurant_tables t
                LEFT JOIN (
                    SELECT table_id, status FROM orders
                    WHERE status = 'pending' AND deleted_at IS NULL
                    GROUP BY table_id
                ) o ON t.id = o.table_id
                WHERE t.merchant_id = ? AND t.deleted_at IS NULL
            ) ta WHERE 1=1
        `;
        const params = [merchantId];

        if (location) { query += ' AND ta.location = ?'; params.push(location); }
        if (status)   { query += ' AND ta.status = ?';   params.push(status); }

        query += ' ORDER BY ta.display_order, ta.table_number ASC';

        const [tables] = await promisePool.query(query, params);
        sendSuccess(res, tables, 'Tables retrieved successfully');
    } catch (error) {
        log.error('Get tables error:', error);
        sendError(res, 'Failed to retrieve tables', 500);
    }
};

// Get table by ID
const getTableById = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantId = req.user.merchant_id;

        const [tables] = await promisePool.query(
            'SELECT * FROM restaurant_tables WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (tables.length === 0) return sendError(res, 'Table not found', 404);
        sendSuccess(res, tables[0], 'Table retrieved successfully');
    } catch (error) {
        log.error('Get table error:', error);
        sendError(res, 'Failed to retrieve table', 500);
    }
};

// Get available tables
const getAvailableTables = async (req, res) => {
    try {
        const merchantId = req.user.merchant_id;

        const [tables] = await promisePool.query(
            `SELECT
                t.id, t.table_number, t.table_name, t.capacity, t.location, t.is_active,
                t.created_at, t.updated_at, t.deleted_at, t.display_order,
                CASE
                    WHEN o.status IS NOT NULL THEN 'occupied'
                    ELSE 'available'
                END AS status
            FROM restaurant_tables t
            LEFT JOIN (
                SELECT table_id, status FROM orders
                WHERE status = 'pending' AND deleted_at IS NULL
                GROUP BY table_id
            ) o ON t.id = o.table_id
            WHERE t.merchant_id = ? AND t.is_active = TRUE AND t.deleted_at IS NULL
            HAVING status = 'available'
            ORDER BY t.display_order ASC`,
            [merchantId]
        );

        sendSuccess(res, tables, 'Available tables retrieved successfully');
    } catch (error) {
        log.error('Get available tables error:', error);
        sendError(res, 'Failed to retrieve available tables', 500);
    }
};

// Create table
const createTable = async (req, res) => {
    try {
        const { table_number, table_name, capacity, location } = req.body;
        const merchantId = req.user.merchant_id;

        const [result] = await promisePool.query(
            'INSERT INTO restaurant_tables (table_number, table_name, capacity, location, created_by, merchant_id) VALUES (?, ?, ?, ?, ?, ?)',
            [table_number, table_name || null, capacity, location, req.user.id, merchantId]
        );

        const [newTable] = await promisePool.query(
            'SELECT * FROM restaurant_tables WHERE id = ?', [result.insertId]
        );

        log.info(`Table created: ${table_number} (ID: ${result.insertId})`);
        sendSuccess(res, newTable[0], 'Table created successfully', 201);
    } catch (error) {
        log.error('Create table error:', error);
        if (error.code === 'ER_DUP_ENTRY') return sendError(res, 'Table number already exists', 409);
        sendError(res, 'Failed to create table', 500);
    }
};

// Update table
const updateTable = async (req, res) => {
    try {
        const { id } = req.params;
        const { table_number, table_name, capacity, location, status, is_active } = req.body;
        const merchantId = req.user.merchant_id;

        const [existing] = await promisePool.query(
            'SELECT id FROM restaurant_tables WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (existing.length === 0) return sendError(res, 'Table not found', 404);

        await promisePool.query(
            `UPDATE restaurant_tables SET table_number = ?, table_name = ?, capacity = ?, location = ?, status = ?, is_active = ?,
             updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?`,
            [table_number, table_name || null, capacity, location, status, is_active, req.user.id, id, merchantId]
        );

        const [updatedTable] = await promisePool.query(
            'SELECT * FROM restaurant_tables WHERE id = ?', [id]
        );

        log.info(`Table updated: ${table_number} (ID: ${id})`);
        sendSuccess(res, updatedTable[0], 'Table updated successfully');
    } catch (error) {
        log.error('Update table error:', error);
        if (error.code === 'ER_DUP_ENTRY') return sendError(res, 'Table number already exists', 409);
        sendError(res, 'Failed to update table', 500);
    }
};

// Update table status
const updateTableStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const merchantId = req.user.merchant_id;

        const [existing] = await promisePool.query(
            'SELECT id FROM restaurant_tables WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (existing.length === 0) return sendError(res, 'Table not found', 404);

        await promisePool.query(
            'UPDATE restaurant_tables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND id <> 99 AND merchant_id = ?',
            [status, id, merchantId]
        );

        const [updatedTable] = await promisePool.query(
            'SELECT * FROM restaurant_tables WHERE id = ?', [id]
        );

        log.info(`Table status updated: ID ${id} to ${status}`);
        sendSuccess(res, updatedTable[0], 'Table status updated successfully');
    } catch (error) {
        log.error('Update table status error:', error);
        sendError(res, 'Failed to update table status', 500);
    }
};

// Delete table (soft delete)
const deleteTable = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantId = req.user.merchant_id;

        const [existing] = await promisePool.query(
            'SELECT id FROM restaurant_tables WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (existing.length === 0) return sendError(res, 'Table not found', 404);

        const [orders] = await promisePool.query(
            "SELECT id FROM orders WHERE table_id = ? AND status = 'pending' AND deleted_at IS NULL LIMIT 1",
            [id]
        );

        if (orders.length > 0) return sendError(res, 'Cannot delete table with pending orders', 400);

        await promisePool.query(
            'UPDATE restaurant_tables SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?',
            [id, merchantId]
        );

        log.info(`Table deleted: ID ${id}`);
        sendSuccess(res, null, 'Table deleted successfully');
    } catch (error) {
        log.error('Delete table error:', error);
        sendError(res, 'Failed to delete table', 500);
    }
};

module.exports = {
    getAllTables,
    getTableById,
    getAvailableTables,
    createTable,
    updateTable,
    updateTableStatus,
    deleteTable
};
