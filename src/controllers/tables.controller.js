const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');

// Get all tables
const getAllTables = async (req, res) => {
    try {
        const { status, location } = req.query;

        // let query = 'SELECT * FROM restaurant_tables WHERE deleted_at IS NULL';
        let query = `select ta.* from (
        select case when o.table_id is null or t.display_order = 0 then 'available' else 'occupied' end status,
        t.id, t.table_number,t.capacity,t.location,t.is_active,t.created_at,t.updated_at,t.deleted_at,t.display_order
         from restaurant_tables t 
        left join orders o on t.id = o.table_id and o.status = 'pending'
        ) ta
        WHERE ta.deleted_at IS NULL`;

        const params = [];

        if (status) {
            query += ' AND ta.status = ?';
            params.push(status);
        }

        if (location) {
            query += ' AND ta.location = ?';
            params.push(location);
        }

        query += ' ORDER BY ta.display_order, ta.table_number ASC';
        log.info(query)
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

        const [tables] = await promisePool.query(
            'SELECT * FROM restaurant_tables WHERE id = ? AND deleted_at IS NULL ',
            [id]
        );

        if (tables.length === 0) {
            return sendError(res, 'Table not found', 404);
        }

        sendSuccess(res, tables[0], 'Table retrieved successfully');

    } catch (error) {
        log.error('Get table error:', error);
        sendError(res, 'Failed to retrieve table', 500);
    }
};

// Get available tables
const getAvailableTables = async (req, res) => {
    try {
        // const [tables] = await promisePool.query(
        //     `SELECT * FROM restaurant_tables 
        //      WHERE status = 'available' 
        //        AND is_active = TRUE 
        //        AND deleted_at IS NULL 
        //      ORDER BY table_number ASC`
        // );

        const [tables] = await promisePool.query(
        `select ta.* from (
        select case when o.table_id is null or t.display_order = 0 then 'available' else 'occupied' end status,
        t.id, t.table_number,t.capacity,t.location,t.is_active,t.created_at,t.updated_at,t.deleted_at,t.display_order
         from restaurant_tables t 
        left join orders o on t.id = o.table_id and o.status = 'pending'
        ) ta
        where ta.table_status = 'available' 
            AND ta.is_active = TRUE 
            AND ta.deleted_at IS NULL 
            ORDER BY ta.display_order ASC`
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
        const { table_number, capacity, location } = req.body;

        const [result] = await promisePool.query(
            `INSERT INTO restaurant_tables (table_number, capacity, location, created_by) 
             VALUES (?, ?, ?, ?)`,
            [table_number, capacity, location, req.user.id]
        );

        const [newTable] = await promisePool.query(
            'SELECT * FROM restaurant_tables WHERE id = ?',
            [result.insertId]
        );

        log.info(`Table created: ${table_number} (ID: ${result.insertId})`);

        sendSuccess(res, newTable[0], 'Table created successfully', 201);

    } catch (error) {
        log.error('Create table error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return sendError(res, 'Table number already exists', 409);
        }
        sendError(res, 'Failed to create table', 500);
    }
};

// Update table
const updateTable = async (req, res) => {
    try {
        const { id } = req.params;
        const { table_number, capacity, location, status, is_active } = req.body;

        const [existing] = await promisePool.query(
            'SELECT id FROM restaurant_tables WHERE id = ? AND deleted_at IS NULL',
            [id]
        );

        if (existing.length === 0) {
            return sendError(res, 'Table not found', 404);
        }

        await promisePool.query(
            `UPDATE restaurant_tables SET 
             table_number = ?, capacity = ?, location = ?, status = ?, is_active = ?, 
             updated_by = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [table_number, capacity, location, status, is_active, req.user.id, id]
        );

        const [updatedTable] = await promisePool.query(
            'SELECT * FROM restaurant_tables WHERE id = ?',
            [id]
        );

        log.info(`Table updated: ${table_number} (ID: ${id})`);

        sendSuccess(res, updatedTable[0], 'Table updated successfully');

    } catch (error) {
        log.error('Update table error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return sendError(res, 'Table number already exists', 409);
        }
        sendError(res, 'Failed to update table', 500);
    }
};

// Update table status
const updateTableStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const [existing] = await promisePool.query(
            'SELECT id FROM restaurant_tables WHERE id = ? AND deleted_at IS NULL',
            [id]
        );

        if (existing.length === 0) {
            return sendError(res, 'Table not found', 404);
        }

        await promisePool.query(
            'UPDATE restaurant_tables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? and id <> 99 ',
            [status, id]
        );

        const [updatedTable] = await promisePool.query(
            'SELECT * FROM restaurant_tables WHERE id = ?',
            [id]
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

        // Check if table is in use
        const [orders] = await promisePool.query(
            'SELECT id FROM orders WHERE table_id = ? AND status = ? AND deleted_at IS NULL LIMIT 1',
            [id, 'pending']
        );

        if (orders.length > 0) {
            return sendError(res, 'Cannot delete table with pending orders', 400);
        }

        await promisePool.query(
            'UPDATE restaurant_tables SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
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