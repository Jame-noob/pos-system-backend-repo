const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');

// Get all products
const getAllProducts = async (req, res) => {
    try {
        log.info('=== GET ALL PRODUCTS ===');
        const { category, search, active = 'true' } = req.query;
        log.debug('Query filters', { category, search, active });

        let query = `
            SELECT p.*, c.name as category_name, c.icon as category_icon
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.deleted_at IS NULL
        `;
        const params = [];

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

        log.db(query, params);
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
        log.info('=== GET PRODUCT BY ID ===');
        const { id } = req.params;
        log.debug('Fetching product', { productId: id });

        const [products] = await promisePool.query(
            `SELECT p.*, c.name as category_name, c.icon as category_icon
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ? AND p.deleted_at IS NULL`,
            [id]
        );

        if (products.length === 0) {
            log.warn('Product not found', { productId: id });
            return sendError(res, 'Product not found', 404);
        }

        log.success('Product retrieved', { productId: id, name: products[0].name });
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
            category_id,
            name,
            slug,
            description,
            price,
            cost_price,
            image_emoji,
            image_url,
            stock_quantity,
            low_stock_threshold,
            sku,
            barcode,
            is_active,
            is_featured
        } = req.body;

        log.debug('Product data', {
            name,
            slug,
            price,
            categoryId: category_id,
            image_url: image_url ? 'provided' : 'not provided'
        });

        const [result] = await promisePool.query(
            `INSERT INTO products
            (category_id, name, slug, description, price, cost_price, image_emoji, image_url, 
             stock_quantity, low_stock_threshold, sku, barcode, is_active, is_featured, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                category_id,
                name,
                name.toLowerCase(),
                description,
                price,
                cost_price || null,
                image_emoji || '🍽️',
                image_url || null,
                stock_quantity || 0,
                low_stock_threshold || 10,
                sku || null,
                barcode || null,
                is_active !== undefined ? is_active : true,
                is_featured !== undefined ? is_featured : false,
                req.user.id
            ]
        );

        const [newProduct] = await promisePool.query(
            `SELECT p.*, c.name as category_name, c.icon as category_icon
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?`,
            [result.insertId]
        );

        log.success(`Product created: ${name}`, {
            productId: result.insertId,
            hasImage: !!image_url
        });

        sendSuccess(res, newProduct[0], 'Product created successfully', 201);

    } catch (error) {
        log.error('Create product error', error);
        if (error.code === 'ER_DUP_ENTRY') {
            log.warn('Duplicate entry', { slug: req.body.slug, sku: req.body.sku });
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
        const {
            category_id,
            name,
            slug,
            description,
            price,
            cost_price,
            image_emoji,
            image_url,
            stock_quantity,
            low_stock_threshold,
            sku,
            barcode,
            is_active,
            is_featured
        } = req.body;

        log.debug('Update product data', {
            productId: id,
            name,
            price,
            image_url: image_url !== undefined ? (image_url ? 'updating' : 'clearing') : 'not changed'
        });

        // Check if product exists
        const [existing] = await promisePool.query(
            'SELECT id, name, image_url FROM products WHERE id = ? AND deleted_at IS NULL',
            [id]
        );

        if (existing.length === 0) {
            log.warn('Product not found for update', { productId: id });
            return sendError(res, 'Product not found', 404);
        }

        log.debug('Product found', {
            oldName: existing[0].name,
            newName: name,
            oldImage: existing[0].image_url,
            newImage: image_url
        });

        // Build update fields dynamically
        const updateFields = [];
        const updateValues = [];

        if (category_id !== undefined) {
            updateFields.push('category_id = ?');
            updateValues.push(category_id);
        }
        if (name !== undefined) {
            updateFields.push('name = ?');
            updateValues.push(name);
        }
        if (slug !== undefined) {
            updateFields.push('slug = ?');
            updateValues.push(slug);
        }
        if (description !== undefined) {
            updateFields.push('description = ?');
            updateValues.push(description);
        }
        if (price !== undefined) {
            updateFields.push('price = ?');
            updateValues.push(price);
        }
        if (cost_price !== undefined) {
            updateFields.push('cost_price = ?');
            updateValues.push(cost_price);
        }
        if (image_emoji !== undefined) {
            updateFields.push('image_emoji = ?');
            updateValues.push(image_emoji);
        }
        if (image_url !== undefined) {
            updateFields.push('image_url = ?');
            updateValues.push(image_url);
        }
        if (stock_quantity !== undefined) {
            updateFields.push('stock_quantity = ?');
            updateValues.push(stock_quantity);
        }
        if (low_stock_threshold !== undefined) {
            updateFields.push('low_stock_threshold = ?');
            updateValues.push(low_stock_threshold);
        }
        if (sku !== undefined) {
            updateFields.push('sku = ?');
            updateValues.push(sku);
        }
        if (barcode !== undefined) {
            updateFields.push('barcode = ?');
            updateValues.push(barcode);
        }
        if (is_active !== undefined) {
            updateFields.push('is_active = ?');
            updateValues.push(is_active);
        }
        if (is_featured !== undefined) {
            updateFields.push('is_featured = ?');
            updateValues.push(is_featured);
        }

        // Always update these fields
        updateFields.push('updated_by = ?', 'updated_at = CURRENT_TIMESTAMP');
        updateValues.push(req.user.id);

        // Add product ID at the end
        updateValues.push(id);

        const updateQuery = `
            UPDATE products 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `;

        log.db('Update query', updateQuery);
        log.db('Update values', updateValues);

        await promisePool.query(updateQuery, updateValues);

        // Fetch updated product
        const [updatedProduct] = await promisePool.query(
            `SELECT p.*, c.name as category_name, c.icon as category_icon
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?`,
            [id]
        );

        log.success(`Product updated: ${name || existing[0].name}`, {
            productId: id,
            imageUpdated: image_url !== undefined
        });

        sendSuccess(res, updatedProduct[0], 'Product updated successfully');

    } catch (error) {
        log.error('Update product error', error);
        if (error.code === 'ER_DUP_ENTRY') {
            log.warn('Duplicate entry', { slug: req.body.slug, sku: req.body.sku });
            return sendError(res, 'Product slug, SKU, or barcode already exists', 409);
        }
        sendError(res, 'Failed to update product', 500);
    }
};

// Delete product (soft delete)
const deleteProduct = async (req, res) => {
    try {
        log.info('=== DELETE PRODUCT ===');
        const { id } = req.params;
        log.debug('Delete product request', { productId: id });

        const [existing] = await promisePool.query(
            'SELECT id, name FROM products WHERE id = ? AND deleted_at IS NULL',
            [id]
        );

        if (existing.length === 0) {
            log.warn('Product not found for deletion', { productId: id });
            return sendError(res, 'Product not found', 404);
        }

        log.debug('Product found', { name: existing[0].name });

        await promisePool.query(
            'UPDATE products SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
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