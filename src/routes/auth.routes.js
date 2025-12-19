const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth');
const validate = require('../middleware/validator');

// Login
router.post('/login',
    [
        body('username').notEmpty().withMessage('Username is required'),
        body('password').notEmpty().withMessage('Password is required')
    ],
    validate,
    authController.login
);

// Get profile
router.get('/profile', verifyToken, authController.getProfile);

// Change password
router.post('/change-password',
    verifyToken,
    [
        body('currentPassword').notEmpty().withMessage('Current password is required'),
        body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
    ],
    validate,
    authController.changePassword
);

module.exports = router;