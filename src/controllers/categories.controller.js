const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');

// Get all categories
const getAllCategories = async (req, res) => {
    try {
        const merchantId = req.user.merchant_id;
        const [categories] = await promisePool.query(
            `SELECT * FROM categories
             WHERE deleted_at IS NULL AND merchant_id = ?
             ORDER BY display_order ASC, name ASC`,
            [merchantId]
        );
        sendSuccess(res, categories, 'Categories retrieved successfully');
    } catch (error) {
        log.error('Get categories error:', error);
        sendError(res, 'Failed to retrieve categories', 500);
    }
};

// Get category by ID
const getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantId = req.user.merchant_id;

        const [categories] = await promisePool.query(
            'SELECT * FROM categories WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (categories.length === 0) {
            return sendError(res, 'Category not found', 404);
        }

        sendSuccess(res, categories[0], 'Category retrieved successfully');
    } catch (error) {
        log.error('Get category error:', error);
        sendError(res, 'Failed to retrieve category', 500);
    }
};

// Create category
const createCategory = async (req, res) => {
    try {
        const { name, icon, description, active, display_order } = req.body;
        const merchantId = req.user.merchant_id;

        const [result] = await promisePool.query(
            `INSERT INTO categories (name, slug, icon, description, is_active, display_order, created_by, merchant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, name.toLowerCase(), icon, description, active ? 1 : 0, display_order || 0, req.user.id, merchantId]
        );

        const [newCategory] = await promisePool.query(
            'SELECT * FROM categories WHERE id = ?',
            [result.insertId]
        );

        log.info(`Category created: ${name} (ID: ${result.insertId})`);
        sendSuccess(res, newCategory[0], 'Category created successfully', 201);
    } catch (error) {
        log.error('Create category error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return sendError(res, 'Category slug already exists', 409);
        }
        sendError(res, 'Failed to create category', 500);
    }
};

// Update category
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, icon, description, display_order, active } = req.body;
        const merchantId = req.user.merchant_id;

        const [existing] = await promisePool.query(
            'SELECT id FROM categories WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (existing.length === 0) {
            return sendError(res, 'Category not found', 404);
        }

        await promisePool.query(
            `UPDATE categories SET
             name = ?, slug = ?, icon = ?, description = ?,
             is_active = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND merchant_id = ?`,
            [name, name.toLowerCase(), icon, description, active ? 1 : 0, req.user.id, id, merchantId]
        );

        const [updatedCategory] = await promisePool.query(
            'SELECT * FROM categories WHERE id = ?',
            [id]
        );

        log.info(`Category updated: ${name} (ID: ${id})`);
        sendSuccess(res, updatedCategory[0], 'Category updated successfully');
    } catch (error) {
        log.error('Update category error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return sendError(res, 'Category slug already exists', 409);
        }
        sendError(res, 'Failed to update category', 500);
    }
};

// Delete category (soft delete)
const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantId = req.user.merchant_id;

        const [existing] = await promisePool.query(
            'SELECT id FROM categories WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (existing.length === 0) {
            return sendError(res, 'Category not found', 404);
        }

        // Check if category is in use
        const [products] = await promisePool.query(
            'SELECT id FROM products WHERE category_id = ? AND deleted_at IS NULL LIMIT 1',
            [id]
        );

        if (products.length > 0) {
            return sendError(res, 'Cannot delete category with existing products', 400);
        }

        await promisePool.query(
            'UPDATE categories SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?',
            [id, merchantId]
        );

        log.info(`Category deleted: ID ${id}`);
        sendSuccess(res, null, 'Category deleted successfully');
    } catch (error) {
        log.error('Delete category error:', error);
        sendError(res, 'Failed to delete category', 500);
    }
};

module.exports = {
    getAllCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    deleteCategory
};
