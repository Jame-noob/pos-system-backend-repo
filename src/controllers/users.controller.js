const bcrypt = require('bcryptjs');
const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');

// Get all users (same merchant only)
const getAllUsers = async (req, res) => {
    try {
        const merchantId = req.user.merchant_id;
        const [users] = await promisePool.query(
            `SELECT id, username, email, full_name, role, is_active AS active, last_login_at, created_at
             FROM users
             WHERE deleted_at IS NULL AND merchant_id = ?
             ORDER BY created_at DESC`,
            [merchantId]
        );
        sendSuccess(res, users, 'Users retrieved successfully');
    } catch (error) {
        log.error('Get all users error', error);
        sendError(res, 'Failed to retrieve users', 500);
    }
};

// Get user by ID
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantId = req.user.merchant_id;

        const [users] = await promisePool.query(
            `SELECT id, username, email, full_name, role, is_active AS active, last_login_at, created_at
             FROM users
             WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL`,
            [id, merchantId]
        );

        if (users.length === 0) return sendError(res, 'User not found', 404);
        sendSuccess(res, users[0], 'User retrieved successfully');
    } catch (error) {
        log.error('Get user by ID error', error);
        sendError(res, 'Failed to retrieve user', 500);
    }
};

// Create user (scoped to admin's merchant)
const createUser = async (req, res) => {
    try {
        const { username, email, full_name, password, role, active } = req.body;
        const merchantId = req.user.merchant_id;

        const [existing] = await promisePool.query(
            'SELECT id FROM users WHERE username = ? AND deleted_at IS NULL',
            [username]
        );
        if (existing.length > 0) return sendError(res, 'Username already exists', 409);

        const password_hash = await bcrypt.hash(password, 10);
        const is_active = active !== undefined ? active : true;

        const [result] = await promisePool.query(
            `INSERT INTO users (username, email, full_name, password_hash, role, is_active, merchant_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [username, email || null, full_name, password_hash, role || 'cashier', is_active, merchantId]
        );

        const [newUser] = await promisePool.query(
            'SELECT id, username, email, full_name, role, is_active AS active, created_at FROM users WHERE id = ?',
            [result.insertId]
        );

        log.success(`User created: ${username}`);
        sendSuccess(res, newUser[0], 'User created successfully', 201);
    } catch (error) {
        log.error('Create user error', error);
        sendError(res, 'Failed to create user', 500);
    }
};

// Update user
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, full_name, password, role, active } = req.body;
        const merchantId = req.user.merchant_id;

        const [existing] = await promisePool.query(
            'SELECT id FROM users WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );
        if (existing.length === 0) return sendError(res, 'User not found', 404);

        if (username) {
            const [dup] = await promisePool.query(
                'SELECT id FROM users WHERE username = ? AND id != ? AND deleted_at IS NULL',
                [username, id]
            );
            if (dup.length > 0) return sendError(res, 'Username already exists', 409);
        }

        const updateFields = [];
        const values = [];

        if (username !== undefined)  { updateFields.push('username = ?');   values.push(username); }
        if (email !== undefined)     { updateFields.push('email = ?');      values.push(email); }
        if (full_name !== undefined) { updateFields.push('full_name = ?');  values.push(full_name); }
        if (role !== undefined)      { updateFields.push('role = ?');       values.push(role); }
        if (active !== undefined)    { updateFields.push('is_active = ?');  values.push(active); }
        if (password) {
            const password_hash = await bcrypt.hash(password, 10);
            updateFields.push('password_hash = ?');
            values.push(password_hash);
        }

        if (updateFields.length === 0) return sendError(res, 'No fields to update', 400);

        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id, merchantId);

        await promisePool.query(
            `UPDATE users SET ${updateFields.join(', ')} WHERE id = ? AND merchant_id = ?`,
            values
        );

        const [updated] = await promisePool.query(
            'SELECT id, username, email, full_name, role, is_active AS active, created_at FROM users WHERE id = ?',
            [id]
        );

        log.success(`User updated: ID ${id}`);
        sendSuccess(res, updated[0], 'User updated successfully');
    } catch (error) {
        log.error('Update user error', error);
        sendError(res, 'Failed to update user', 500);
    }
};

// Delete user (soft delete)
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantId = req.user.merchant_id;

        if (parseInt(id) === req.user.id) {
            return sendError(res, 'Cannot delete your own account', 400);
        }

        const [existing] = await promisePool.query(
            'SELECT id FROM users WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );
        if (existing.length === 0) return sendError(res, 'User not found', 404);

        await promisePool.query(
            'UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?',
            [id, merchantId]
        );

        log.success(`User deleted: ID ${id}`);
        sendSuccess(res, null, 'User deleted successfully');
    } catch (error) {
        log.error('Delete user error', error);
        sendError(res, 'Failed to delete user', 500);
    }
};

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser };
