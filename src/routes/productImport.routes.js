// backend/routes/productImport.routes.js

const express = require('express');
const router = express.Router();
const productImportController = require('../controllers/productImport.controller');
const { verifyToken, checkRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory for CSV files
const uploadsDir = path.join(__dirname, '../uploads/csv');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for CSV upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'import-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        if (path.extname(file.originalname).toLowerCase() !== '.csv') {
            return cb(new Error('Only CSV files are allowed'));
        }
        cb(null, true);
    }
});

// Import products from CSV (Admin/Manager only)
router.post('/import',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    upload.single('file'),
    productImportController.importProducts
);

// Get import history
router.get('/history',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    productImportController.getImportHistory
);

// Get import details with errors
router.get('/history/:id',
    verifyToken,
    checkRole(ROLES.ADMIN, ROLES.MANAGER),
    productImportController.getImportDetails
);

// Download CSV template
router.get('/template',
    verifyToken,
    productImportController.downloadTemplate
);

module.exports = router;