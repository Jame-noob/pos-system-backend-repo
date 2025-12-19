const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const log = require('../utils/logger');

// GET QR Code endpoint
router.get('/', async (req, res) => {
    try {
        const { orderId, amount, tableNumber } = req.query;

        // Log the request for debugging
        log.info('QR Code requested:', { orderId, amount, tableNumber });

        // Path to your QR code image
        const qrCodePath = path.join(__dirname, '../uploads/qrcodes/bcelQrCodeLogo.jpeg');

        // Check if file exists
        if (!fs.existsSync(qrCodePath)) {
            log.error('QR Code file not found:', qrCodePath);
            return res.status(404).json({ 
                success: false,
                error: 'QR Code not found',
                path: qrCodePath 
            });
        }

        // Set appropriate headers
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Send the file
        res.sendFile(qrCodePath);

    } catch (error) {
        log.error('Error serving QR code:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load QR code',
            message: error.message 
        });
    }
});

module.exports = router;