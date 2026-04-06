const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');

// Get all products
const getAllProducts = async (req, res) => {
    try {
        log.info('=== GET ALL PRODUCTS ===');
        const { category, search, active = 'true' } = req.query;
        const merchantId = req.user.merchant_id;

        let query = `
            SELECT p.*, c.name as category_name, c.icon as category_icon
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.deleted_at IS NULL AND p.merchant_id = ?
        `;
        const params = [merchantId];

        if (active === 'true') {
            query += ' AND p.is_active = TRUE';
        }

        if (category) {
            query += ' AND p.category_id = ?';
            params.push(category);
        }

        if (search) {
            query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY p.name ASC';

        const [products] = await promisePool.query(query, params);
        log.success(`Retrieved ${products.length} products`);
        sendSuccess(res, products, 'Products retrieved successfully');
    } catch (error) {
        log.error('Get products error', error);
        sendError(res, 'Failed to retrieve products', 500);
    }
};

// Get product by ID
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantId = req.user.merchant_id;

        const [products] = await promisePool.query(
            `SELECT p.*, c.name as category_name, c.icon as category_icon
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ? AND p.merchant_id = ? AND p.deleted_at IS NULL`,
            [id, merchantId]
        );

        if (products.length === 0) {
            return sendError(res, 'Product not found', 404);
        }

        sendSuccess(res, products[0], 'Product retrieved successfully');
    } catch (error) {
        log.error('Get product error', error);
        sendError(res, 'Failed to retrieve product', 500);
    }
};

// Create product
const createProduct = async (req, res) => {
    try {
        log.info('=== CREATE PRODUCT ===');
        const {
            category_id, name, slug, description, price, cost_price,
            image_emoji, image_url, stock_quantity, low_stock_threshold,
            sku, barcode, is_active, is_featured
        } = req.body;
        const merchantId = req.user.merchant_id;

        const [result] = await promisePool.query(
            `INSERT INTO products
            (category_id, name, slug, description, price, cost_price, image_emoji, image_url,
             stock_quantity, low_stock_threshold, sku, barcode, is_active, is_featured, created_by, merchant_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                category_id, name, name.toLowerCase(), description, price,
                cost_price || null, image_emoji || '🍽️', image_url || null,
                stock_quantity || 0, low_stock_threshold || 10,
                sku || null, barcode || null,
                is_active !== undefined ? is_active : true,
                is_featured !== undefined ? is_featured : false,
                req.user.id, merchantId
            ]
        );

        const [newProduct] = await promisePool.query(
            `SELECT p.*, c.name as category_name, c.icon as category_icon
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?`,
            [result.insertId]
        );

        log.success(`Product created: ${name}`, { productId: result.insertId });
        sendSuccess(res, newProduct[0], 'Product created successfully', 201);
    } catch (error) {
        log.error('Create product error', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return sendError(res, 'Product slug, SKU, or barcode already exists', 409);
        }
        sendError(res, 'Failed to create product', 500);
    }
};

// Update product
const updateProduct = async (req, res) => {
    try {
        log.info('=== UPDATE PRODUCT ===');
        const { id } = req.params;
        const merchantId = req.user.merchant_id;
        const {
            category_id, name, slug, description, price, cost_price,
            image_emoji, image_url, stock_quantity, low_stock_threshold,
            sku, barcode, is_active, is_featured
        } = req.body;

        const [existing] = await promisePool.query(
            'SELECT id, name, image_url FROM products WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (existing.length === 0) {
            return sendError(res, 'Product not found', 404);
        }

        const updateFields = [];
        const updateValues = [];

        if (category_id !== undefined)        { updateFields.push('category_id = ?');        updateValues.push(category_id); }
        if (name !== undefined)               { updateFields.push('name = ?');               updateValues.push(name); }
        if (slug !== undefined)               { updateFields.push('slug = ?');               updateValues.push(slug); }
        if (description !== undefined)        { updateFields.push('description = ?');        updateValues.push(description); }
        if (price !== undefined)              { updateFields.push('price = ?');              updateValues.push(price); }
        if (cost_price !== undefined)         { updateFields.push('cost_price = ?');         updateValues.push(cost_price); }
        if (image_emoji !== undefined)        { updateFields.push('image_emoji = ?');        updateValues.push(image_emoji); }
        if (image_url !== undefined)          { updateFields.push('image_url = ?');          updateValues.push(image_url); }
        if (stock_quantity !== undefined)     { updateFields.push('stock_quantity = ?');     updateValues.push(stock_quantity); }
        if (low_stock_threshold !== undefined){ updateFields.push('low_stock_threshold = ?');updateValues.push(low_stock_threshold); }
        if (sku !== undefined)                { updateFields.push('sku = ?');                updateValues.push(sku); }
        if (barcode !== undefined)            { updateFields.push('barcode = ?');            updateValues.push(barcode); }
        if (is_active !== undefined)          { updateFields.push('is_active = ?');          updateValues.push(is_active); }
        if (is_featured !== undefined)        { updateFields.push('is_featured = ?');        updateValues.push(is_featured); }

        updateFields.push('updated_by = ?', 'updated_at = CURRENT_TIMESTAMP');
        updateValues.push(req.user.id, id, merchantId);

        await promisePool.query(
            `UPDATE products SET ${updateFields.join(', ')} WHERE id = ? AND merchant_id = ?`,
            updateValues
        );

        const [updatedProduct] = await promisePool.query(
            `SELECT p.*, c.name as category_name, c.icon as category_icon
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?`,
            [id]
        );

        log.success(`Product updated`, { productId: id });
        sendSuccess(res, updatedProduct[0], 'Product updated successfully');
    } catch (error) {
        log.error('Update product error', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return sendError(res, 'Product slug, SKU, or barcode already exists', 409);
        }
        sendError(res, 'Failed to update product', 500);
    }
};

// Delete product (soft delete)
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const merchantId = req.user.merchant_id;

        const [existing] = await promisePool.query(
            'SELECT id, name FROM products WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
            [id, merchantId]
        );

        if (existing.length === 0) {
            return sendError(res, 'Product not found', 404);
        }

        await promisePool.query(
            'UPDATE products SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND merchant_id = ?',
            [id, merchantId]
        );

        log.success(`Product deleted: ${existing[0].name}`, { productId: id });
        sendSuccess(res, null, 'Product deleted successfully');
    } catch (error) {
        log.error('Delete product error', error);
        sendError(res, 'Failed to delete product', 500);
    }
};

module.exports = {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
};
