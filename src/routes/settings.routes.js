const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const settingsController = require('../controllers/settings.controller');
const { verifyToken, checkRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const validate = require('../middleware/validator');

// ── Dedicated per-category endpoints ─────────────────────────────────────────
router.get('/merchant',  verifyToken, settingsController.getMerchantSettings);
router.put('/merchant',  verifyToken, checkRole(ROLES.ADMIN), settingsController.updateMerchantSettings);

router.get('/printer',   verifyToken, settingsController.getPrinterSettings);
router.put('/printer',   verifyToken, checkRole(ROLES.ADMIN), settingsController.updatePrinterSettings);

router.get('/payment',   verifyToken, settingsController.getPaymentSettings);
router.put('/payment',   verifyToken, checkRole(ROLES.ADMIN), settingsController.updatePaymentSettings);

// ── Legacy / combined endpoints ───────────────────────────────────────────────
// Get all settings
router.get('/', verifyToken, settingsController.getAllSettings);

// Get setting by key
router.get('/:key', verifyToken, settingsController.getSettingByKey);

// Update setting (Admin only)
router.put('/:key',
    verifyToken,
    checkRole(ROLES.ADMIN),
    [
        body('value').notEmpty().withMessage('Value is required')
    ],
    validate,
    settingsController.updateSetting
);

// Update multiple settings (Admin only)
router.post('/bulk-update',
    verifyToken,
    checkRole(ROLES.ADMIN),
    [
        body('settings').isObject().withMessage('Settings object is required')
    ],
    validate,
    settingsController.updateMultipleSettings
);

// Create setting (Admin only)
router.post('/',
    verifyToken,
    checkRole(ROLES.ADMIN),
    [
        body('setting_key').notEmpty().withMessage('Setting key is required'),
        body('setting_value').notEmpty().withMessage('Setting value is required')
    ],
    validate,
    settingsController.createSetting
);

module.exports = router;