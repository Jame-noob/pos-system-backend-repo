const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const categoriesController = require('../controllers/categories.controller');
const { verifyToken, checkRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const validate = require('../middleware/validator');

// Get all categories
router.get('/', verifyToken, categoriesController.getAllCategories);

// Get category by ID
router.get('/:id', verifyToken, categoriesController.getCategoryById);

// Create category (Admin/Manager only)
router.post('/',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    [
        body('name').notEmpty().withMessage('Category name is required'),
        // body('slug').notEmpty().withMessage('Category slug is required'),
        // body('icon').notEmpty().withMessage('Icon is required')
    ],
    validate,
    categoriesController.createCategory
);

// Update category (Admin/Manager only)
router.put('/:id',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    [
        body('name').notEmpty().withMessage('Category name is required'),
        // body('slug').notEmpty().withMessage('Category slug is required')
    ],
    validate,
    categoriesController.updateCategory
);

// Delete category (Admin only)
router.delete('/:id',
    verifyToken,
    checkRole(ROLES.ADMIN),
    categoriesController.deleteCategory
);

module.exports = router;