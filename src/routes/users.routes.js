const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const usersController = require('../controllers/users.controller');
const { verifyToken, checkRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const validate = require('../middleware/validator');

// All user management is admin-only
router.get('/', verifyToken, checkRole(ROLES.ADMIN), usersController.getAllUsers);

router.get('/:id', verifyToken, checkRole(ROLES.ADMIN), usersController.getUserById);

router.post('/',
    verifyToken,
    checkRole(ROLES.ADMIN),
    [
        body('username').notEmpty().withMessage('Username is required'),
        body('full_name').notEmpty().withMessage('Full name is required'),
        body('password').notEmpty().withMessage('Password is required'),
        body('role').optional().isIn([ROLES.ADMIN, ROLES.MANAGER, ROLES.CASHIER])
            .withMessage('Invalid role'),
    ],
    validate,
    usersController.createUser
);

router.put('/:id',
    verifyToken,
    checkRole(ROLES.ADMIN),
    [
        body('username').optional().notEmpty().withMessage('Username cannot be empty'),
        body('full_name').optional().notEmpty().withMessage('Full name cannot be empty'),
        body('role').optional().isIn([ROLES.ADMIN, ROLES.MANAGER, ROLES.CASHIER])
            .withMessage('Invalid role'),
    ],
    validate,
    usersController.updateUser
);

router.delete('/:id', verifyToken, checkRole(ROLES.ADMIN), usersController.deleteUser);

module.exports = router;
