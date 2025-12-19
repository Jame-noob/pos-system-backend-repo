const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const paymentsController = require('../controllers/payments.controller');
const { verifyToken, checkRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const validate = require('../middleware/validator');

// Get all payments
router.get('/', verifyToken, paymentsController.getAllPayments);

// Get payment by ID
router.get('/:id', verifyToken, paymentsController.getPaymentById);

// Get payments by order ID
router.get('/order/:orderId', verifyToken, paymentsController.getPaymentsByOrderId);

// Refund payment (Admin/Manager only)
router.post('/:id/refund',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    [
        body('reason').optional().isString()
    ],
    validate,
    paymentsController.refundPayment
);

module.exports = router;