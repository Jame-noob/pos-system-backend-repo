// src/routes/orders.routes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const ordersController = require('../controllers/orders.controller');
const { verifyToken } = require('../middleware/auth');
const validate = require('../middleware/validator');

// Get pending orders count (add this BEFORE '/:id' route to avoid conflicts)
router.get('/pending/count', verifyToken, ordersController.getPendingOrderCountAPI);

// Get all orders
router.get('/', verifyToken, ordersController.getAllOrders);

// Get order by ID
router.get('/:id', verifyToken, ordersController.getOrderById);

// Create order
router.post('/',
    verifyToken,
    [
        body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
        body('items.*.product_id').isInt().withMessage('Product ID is required'),
        body('items.*.product_name').notEmpty().withMessage('Product name is required'),
        body('items.*.quantity').isInt({ min: 1 }).withMessage('Valid quantity is required'),
        body('items.*.unit_price').isFloat({ min: 0 }).withMessage('Valid price is required')
    ],
    validate,
    ordersController.createOrder
);

// Update order
router.put('/:id',
    verifyToken,
    [
        body('items').isArray({ min: 1 }).withMessage('At least one item is required')
    ],
    validate,
    ordersController.updateOrder
);

// Complete order (process payment)
router.post('/:id/complete',
    verifyToken,
    [
        body('payment_method').notEmpty().withMessage('Payment method is required'),
        body('amount_received').isFloat({ min: 0 }).withMessage('Amount received is required')
    ],
    validate,
    ordersController.completeOrder
);

// Cancel order
router.post('/:id/cancel', verifyToken, ordersController.cancelOrder);

module.exports = router;