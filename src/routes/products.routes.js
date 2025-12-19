const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const productsController = require('../controllers/products.controller');
const { verifyToken, checkRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const validate = require('../middleware/validator');
const log = require('../utils/logger');

log.info('--------products START---------');

// Get all products
router.get('/', verifyToken, productsController.getAllProducts);

// Get product by ID
router.get('/:id', verifyToken, productsController.getProductById);

// Create product (Admin/Manager only)
router.post('/',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    [
        body('category_id').isInt().withMessage('Category ID is required'),
        body('name').notEmpty().withMessage('Product name is required'),
        // body('slug').notEmpty().withMessage('Product slug is required'),
        body('price').isFloat({ min: 0 }).withMessage('Valid price is required'),
        body('image_emoji').optional(),
        body('image_url').optional().isString(),
        body('stock_quantity').optional().isInt({ min: 0 }),
        body('low_stock_threshold').optional().isInt({ min: 0 }),
        body('sku').optional(),
        body('barcode').optional(),
        body('is_active').optional().isBoolean(),
        body('is_featured').optional().isBoolean()
    ],
    validate,
    productsController.createProduct
);

// Update product (Admin/Manager only)
router.put('/:id',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    [
        body('category_id').optional().isInt(),
        body('name').optional().notEmpty(),
        body('slug').optional().notEmpty(),
        body('price').optional().isFloat({ min: 0 }),
        body('image_emoji').optional(),
        body('image_url').optional(),
        body('stock_quantity').optional().isInt({ min: 0 }),
        body('low_stock_threshold').optional().isInt({ min: 0 }),
        body('sku').optional(),
        body('barcode').optional(),
        body('is_active').optional().isBoolean(),
        body('is_featured').optional().isBoolean()
    ],
    validate,
    productsController.updateProduct
);

// Delete product (Admin only)
router.delete('/:id',
    verifyToken,
    checkRole(ROLES.ADMIN),
    productsController.deleteProduct
);

log.info('--------products END---------');

module.exports = router;