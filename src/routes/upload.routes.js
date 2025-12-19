const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('../middleware/auth');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');
const paths = require('../config/paths');

// Configure storage using centralized paths
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        log.info('📁 Multer destination called');
        log.info('Upload directory:', paths.PRODUCTS_UPLOADS_DIR);

        // Ensure directory exists
        if (!fs.existsSync(paths.PRODUCTS_UPLOADS_DIR)) {
            fs.mkdirSync(paths.PRODUCTS_UPLOADS_DIR, { recursive: true });
            log.info('Created directory during upload');
        }

        cb(null, paths.PRODUCTS_UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const filename = 'product-' + uniqueSuffix + ext;

        log.info('📝 Generated filename:', filename);
        log.info('Original filename:', file.originalname);
        log.info('File mimetype:', file.mimetype);

        cb(null, filename);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    log.info('🔍 File filter called');
    log.info('File details:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
    });

    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        log.info('✅ File type accepted');
        return cb(null, true);
    } else {
        log.warn('❌ File type rejected');
        cb(new Error('Only image files (JPEG, JPG, PNG, GIF, WEBP) are allowed!'));
    }
};

// Upload configuration
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: fileFilter
});

// Upload single image
router.post('/image', verifyToken, (req, res) => {
    log.info('========== UPLOAD IMAGE REQUEST ==========');

    upload.single('image')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            log.error('❌ Multer error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return sendError(res, 'File size too large. Maximum 5MB allowed.', 400);
            }
            return sendError(res, err.message, 400);
        } else if (err) {
            log.error('❌ Upload error:', err);
            return sendError(res, err.message, 400);
        }

        try {
            if (!req.file) {
                log.warn('❌ No file in request');
                return sendError(res, 'No file uploaded', 400);
            }

            log.info('✅ File received:', {
                fieldname: req.file.fieldname,
                originalname: req.file.originalname,
                filename: req.file.filename,
                path: req.file.path,
                size: req.file.size
            });

            // Verify file was actually saved
            if (fs.existsSync(req.file.path)) {
                const stats = fs.statSync(req.file.path);
                log.info('✅ File exists on disk:', {
                    path: req.file.path,
                    size: stats.size
                });
            } else {
                log.error('❌ File NOT found on disk:', req.file.path);
                return sendError(res, 'File upload failed - file not saved', 500);
            }

            // Return relative URL path (not absolute file system path)
            const imageUrl = `${paths.PRODUCTS_UPLOADS_URL}/${req.file.filename}`;
            // const imageUrl = `/uploads/products/${req.file.filename}`;

            log.success('🎉 Image uploaded successfully', {
                filename: req.file.filename,
                url: imageUrl,
                size: req.file.size
            });

            sendSuccess(res, {
                url: imageUrl,
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype
            }, 'Image uploaded successfully');

        } catch (error) {
            log.error('❌ Upload processing error:', error);
            sendError(res, 'Failed to process upload', 500);
        }
    });
});

// Delete image
router.delete('/image/:filename', verifyToken, (req, res) => {
    try {
        const { filename } = req.params;
        const filepath = path.join(paths.PRODUCTS_UPLOADS_DIR, filename);

        log.info('🗑️ Attempting to delete image:', filepath);

        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            log.success('✅ Image deleted successfully', { filename });
            sendSuccess(res, null, 'Image deleted successfully');
        } else {
            log.warn('❌ Image not found for deletion', { filename, path: filepath });
            sendError(res, 'Image not found', 404);
        }
    } catch (error) {
        log.error('❌ Delete image error:', error);
        sendError(res, 'Failed to delete image', 500);
    }
});

// Get image info
router.get('/image/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filepath = path.join(paths.PRODUCTS_UPLOADS_DIR, filename);

        if (fs.existsSync(filepath)) {
            const stats = fs.statSync(filepath);
            sendSuccess(res, {
                filename: filename,
                size: stats.size,
                created: stats.birthtime,
                url: `${paths.PRODUCTS_UPLOADS_URL}/${filename}`
            }, 'Image info retrieved');
        } else {
            sendError(res, 'Image not found', 404);
        }
    } catch (error) {
        log.error('Get image info error:', error);
        sendError(res, 'Failed to get image info', 500);
    }
});

// Debug endpoint - List all files in upload directory
router.get('/debug/files', verifyToken, (req, res) => {
    try {
        log.info('📋 Listing files in upload directory');

        if (!fs.existsSync(paths.PRODUCTS_UPLOADS_DIR)) {
            return sendError(res, 'Upload directory does not exist', 404);
        }

        const files = fs.readdirSync(paths.PRODUCTS_UPLOADS_DIR);
        const fileDetails = files.map(filename => {
            const filepath = path.join(paths.PRODUCTS_UPLOADS_DIR, filename);
            const stats = fs.statSync(filepath);
            return {
                filename,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                url: `${paths.PRODUCTS_UPLOADS_URL}/${filename}`
            };
        });

        sendSuccess(res, {
            directory: paths.PRODUCTS_UPLOADS_DIR,
            urlPath: paths.PRODUCTS_UPLOADS_URL,
            count: files.length,
            files: fileDetails
        }, 'Files listed successfully');

    } catch (error) {
        log.error('Error listing files:', error);
        sendError(res, 'Failed to list files', 500);
    }
});

// Test endpoint
router.get('/test', verifyToken, (req, res) => {
    try {
        log.info('========== UPLOAD TEST ==========');

        const testResults = {
            uploadDirectory: paths.PRODUCTS_UPLOADS_DIR,
            urlPath: paths.PRODUCTS_UPLOADS_URL,
            exists: fs.existsSync(paths.PRODUCTS_UPLOADS_DIR),
            writable: false,
            readable: false,
            absolutePath: path.resolve(paths.PRODUCTS_UPLOADS_DIR),
            files: []
        };

        if (testResults.exists) {
            try {
                fs.accessSync(paths.PRODUCTS_UPLOADS_DIR, fs.constants.W_OK);
                testResults.writable = true;
            } catch (e) {
                testResults.writableError = e.message;
            }

            try {
                fs.accessSync(paths.PRODUCTS_UPLOADS_DIR, fs.constants.R_OK);
                testResults.readable = true;
            } catch (e) {
                testResults.readableError = e.message;
            }

            try {
                testResults.files = fs.readdirSync(paths.PRODUCTS_UPLOADS_DIR);
            } catch (e) {
                testResults.filesError = e.message;
            }
        }

        // Try to create a test file
        try {
            const testFilePath = path.join(paths.PRODUCTS_UPLOADS_DIR, 'test-write.txt');
            fs.writeFileSync(testFilePath, 'Test write');
            testResults.testWrite = 'Success';

            fs.unlinkSync(testFilePath);
            testResults.testDelete = 'Success';
        } catch (e) {
            testResults.testWrite = 'Failed: ' + e.message;
        }

        log.info('Test results:', testResults);
        sendSuccess(res, testResults, 'Upload test completed');

    } catch (error) {
        log.error('Test error:', error);
        sendError(res, 'Test failed: ' + error.message, 500);
    }
});

module.exports = router;