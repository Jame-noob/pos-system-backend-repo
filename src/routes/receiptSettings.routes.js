// routes/receiptSettings.routes.js

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const receiptSettingsController = require('../controllers/receiptSettings.controller');
const { verifyToken, checkRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const validate = require('../middleware/validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const logosDir = path.join(__dirname, '../uploads/logos');
const qrcodesDir = path.join(__dirname, '../uploads/qrcodes');


if (!fs.existsSync(logosDir)) {
    fs.mkdirSync(logosDir, { recursive: true });
}
if (!fs.existsSync(qrcodesDir)) {
    fs.mkdirSync(qrcodesDir, { recursive: true });
}



// Configure multer for logo upload
// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, uploadsDir);
//     },
//     filename: function (req, file, cb) {
//         const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//         const ext = path.extname(file.originalname);
//         cb(null, 'logo-' + uniqueSuffix + ext);
//     }
// });


// Configure multer for QR code upload
const qrCodeStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, qrcodesDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'qrcode-' + uniqueSuffix + ext);
    }
});

const logoStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, logosDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'qrcode-' + uniqueSuffix + ext);
    }
});


const uploadQRCode = multer({
    storage: qrCodeStorage,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

const uploadLogo = multer({
    storage: logoStorage,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});
// const upload = multer({
//     storage: storage,
//     limits: {
//         fileSize: 2 * 1024 * 1024 // 2MB limit
//     }
// });

// Get receipt settings
router.get('/',
    verifyToken,
    receiptSettingsController.getSettings
);

// Update receipt settings (Admin/Manager only)
router.put('/',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    [
        body('businessName').notEmpty().withMessage('Business name is required'),
        body('phone').notEmpty().withMessage('Phone is required'),
        // body('email').optional().isEmail().withMessage('Invalid email format'),
    ],
    validate,
    receiptSettingsController.updateSettings
);

// Upload logo (Admin/Manager only)
router.post('/logo',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    uploadLogo.single('logo'),
    receiptSettingsController.uploadLogo
);

// Delete logo (Admin/Manager only)
router.delete('/logo',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    receiptSettingsController.deleteLogo
);


// Upload QR code (Admin/Manager only)
router.post('/qrcode',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    uploadQRCode.single('qrcode'),
    receiptSettingsController.uploadQRCode
);

// Delete QR code (Admin/Manager only)
router.delete('/qrcode',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    receiptSettingsController.deleteQRCode
);

module.exports = router;