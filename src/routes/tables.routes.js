const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const tablesController = require('../controllers/tables.controller');
const { verifyToken, checkRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const validate = require('../middleware/validator');

// Get all tables
router.get('/', verifyToken, tablesController.getAllTables);

// Get available tables
router.get('/available', verifyToken, tablesController.getAvailableTables);

// Get table by ID
router.get('/:id', verifyToken, tablesController.getTableById);

// Create table (Admin/Manager only)
router.post('/',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    [
        body('table_number').notEmpty().withMessage('Table number is required'),
        body('capacity').isInt({ min: 0 }).withMessage('Valid capacity is required')
    ],
    validate,
    tablesController.createTable
);

// Update table (Admin/Manager only)
router.put('/:id',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    [
        body('table_number').notEmpty().withMessage('Table number is required'),
        body('capacity').isInt({ min: 0 }).withMessage('Valid capacity is required')
    ],
    validate,
    tablesController.updateTable
);

// Update table status
router.patch('/:id/status',
    verifyToken,
    [
        body('status').notEmpty().withMessage('Status is required')
    ],
    validate,
    tablesController.updateTableStatus
);

// Delete table (Admin only)
router.delete('/:id',
    verifyToken,
    checkRole(ROLES.ADMIN),
    tablesController.deleteTable
);

module.exports = router;