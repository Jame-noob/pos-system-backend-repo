const { promisePool } = require('../config/database');
const log = require('../utils/logger');

const updateProductStock = async (productId, quantity, movementType, referenceType, referenceId, userId, notes = null) => {
    const connection = await promisePool.getConnection();

    try {
        log.debug('=== UPDATE PRODUCT STOCK ===');
        await connection.beginTransaction();

        log.debug('Stock update request', {
            productId,
            quantity,
            movementType,
            referenceType,
            referenceId
        });

        // Get current stock
        const [products] = await connection.query(
            'SELECT stock_quantity, name FROM products WHERE id = ?',
            [productId]
        );

        if (products.length === 0) {
            log.warn('Product not found for stock update', { productId });
            throw new Error('Product not found');
        }

        const previousQuantity = products[0].stock_quantity;
        const newQuantity = previousQuantity + quantity;

        log.debug('Stock calculation', {
            product: products[0].name,
            previous: previousQuantity,
            change: quantity,
            new: newQuantity
        });

        // Update product stock
        await connection.query(
            'UPDATE products SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newQuantity, productId]
        );

        // Log stock movement
        await connection.query(
            `INSERT INTO stock_movements 
            (product_id, movement_type, quantity, reference_type, reference_id, previous_quantity, new_quantity, notes, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [productId, movementType, quantity, referenceType, referenceId, previousQuantity, newQuantity, notes, userId]
        );

        await connection.commit();
        log.success('Stock updated', {
            productId,
            productName: products[0].name,
            previousQuantity,
            newQuantity
        });

        return { previousQuantity, newQuantity };
    } catch (error) {
        await connection.rollback();
        log.error('Stock update failed - Transaction rolled back', error);
        throw error;
    } finally {
        connection.release();
    }
};

const checkProductAvailability = async (productId, requiredQuantity) => {
    log.debug('Checking product availability', { productId, requiredQuantity });

    const [products] = await promisePool.query(
        'SELECT stock_quantity, name FROM products WHERE id = ? AND is_active = TRUE AND deleted_at IS NULL',
        [productId]
    );

    if (products.length === 0) {
        log.warn('Product not available', { productId });
        return { available: false, message: 'Product not found or inactive' };
    }

    const available = products[0].stock_quantity >= requiredQuantity;

    log.debug('Availability check result', {
        product: products[0].name,
        available,
        currentStock: products[0].stock_quantity,
        required: requiredQuantity
    });

    return {
        available,
        currentStock: products[0].stock_quantity,
        message: available ? 'Stock available' : 'Insufficient stock'
    };
};

module.exports = {
    updateProductStock,
    checkProductAvailability
};