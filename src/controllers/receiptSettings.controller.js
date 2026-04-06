// controllers/receiptSettings.controller.js

const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;

// Get receipt settings
const getSettings = async (req, res) => {
    try {
        const merchantId = req.user.merchant_id;

        const [[settings], [merchants], [payments]] = await Promise.all([
            promisePool.query('SELECT * FROM receipt_settings WHERE merchant_id = ?', [merchantId]),
            promisePool.query(
                'SELECT business_name, address, phone, email, website, tax_id FROM merchants WHERE merchant_id = ?',
                [merchantId]
            ),
            promisePool.query(
                'SELECT mobile_qr_url FROM payment_settings WHERE merchant_id = ?',
                [merchantId]
            ),
        ]);

        if (settings.length === 0) {
            await promisePool.query(
                `INSERT INTO receipt_settings (merchant_id, created_by, business_name, updated_date)
                 VALUES (?, ?, '', NOW())`,
                [merchantId, req.user.id]
            );
            const [newSettings] = await promisePool.query(
                'SELECT * FROM receipt_settings WHERE merchant_id = ?',
                [merchantId]
            );
            return sendSuccess(res, formatSettings(newSettings[0], merchants[0], payments[0]), 'Receipt settings retrieved successfully');
        }

        // Restore soft-deleted record if needed
        if (settings[0].deleted_at) {
            await promisePool.query(
                'UPDATE receipt_settings SET deleted_at = NULL WHERE merchant_id = ?',
                [merchantId]
            );
            settings[0].deleted_at = null;
        }

        sendSuccess(res, formatSettings(settings[0], merchants[0], payments[0]), 'Receipt settings retrieved successfully');

    } catch (error) {
        log.error('Get receipt settings error:', error);
        sendError(res, 'Failed to retrieve receipt settings', 500);
    }
};

// Update receipt settings
const updateSettings = async (req, res) => {
    try {
        const merchantId = req.user.merchant_id;
        const {
            businessName,
            address,
            city,
            phone,
            email,
            website,
            taxId,
            logoUrl,
            showLogo,
            logoSize,
            logoWidth,
            logoHeight,
            logoMarginTop,
            logoMarginBottom,
            headerText,
            showHeader,
            headerAlign,
            footerText,
            showFooter,
            footerAlign,
            showTaxId,
            showWebsite,
            showEmail,
            paperSize,
            fontFamily,
            fontSize,
            additionalInfo,
            showOrderNumber,
            showDateTime,
            showCashier,
            showTableNumber,
            showQRCode,
            qrCodeData,
            qrCodeUrl,
            qrCodeWidth,
            qrCodeHeight,
            qrCodeMarginTop,
            qrCodeMarginBottom,
        } = req.body;

        // Ensure a record exists for this merchant before updating
        const [existing] = await promisePool.query(
            'SELECT id, deleted_at FROM receipt_settings WHERE merchant_id = ?',
            [merchantId]
        );

        if (existing.length === 0) {
            await promisePool.query(
                `INSERT INTO receipt_settings (merchant_id, created_by, business_name, updated_date)
                 VALUES (?, ?, '', NOW())`,
                [merchantId, req.user.id]
            );
        } else if (existing[0].deleted_at) {
            await promisePool.query(
                'UPDATE receipt_settings SET deleted_at = NULL WHERE merchant_id = ?',
                [merchantId]
            );
        }

        // Sync business info back to merchants table
        await promisePool.query(
            `INSERT INTO merchants (merchant_id, merchant_name, merchant_name_la, created_by, created_date,
                business_name, address, phone, email, website, tax_id)
             VALUES (?, '', '', ?, NOW(), ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                business_name = VALUES(business_name),
                address       = VALUES(address),
                phone         = VALUES(phone),
                email         = VALUES(email),
                website       = VALUES(website),
                tax_id        = VALUES(tax_id),
                updated_at    = CURRENT_TIMESTAMP`,
            [merchantId, String(merchantId), businessName || '', address || '', phone || '', email || '', website || '', taxId || '']
        );

        await promisePool.query(
            `UPDATE receipt_settings SET
                business_name = ?,
                address = ?,
                city = ?,
                phone = ?,
                email = ?,
                website = ?,
                tax_id = ?,
                logo_url = ?,
                show_logo = ?,
                logo_size = ?,
                logo_width = ?,
                logo_height = ?,
                logo_margin_top = ?,
                logo_margin_bottom = ?,
                header_text = ?,
                show_header = ?,
                header_align = ?,
                footer_text = ?,
                show_footer = ?,
                footer_align = ?,
                show_tax_id = ?,
                show_website = ?,
                show_email = ?,
                paper_size = ?,
                font_family = ?,
                font_size = ?,
                additional_info = ?,
                show_order_number = ?,
                show_date_time = ?,
                show_cashier = ?,
                show_table_number = ?,
                show_qr_code = ?,
                qr_code_data = ?,
                qr_code_url = ?,
                qr_code_width = ?,
                qr_code_height = ?,
                qr_code_margin_top = ?,
                qr_code_margin_bottom = ?,
                updated_by = ?,
                updated_at = CURRENT_TIMESTAMP,
                updated_date = NOW()
            WHERE merchant_id = ?`,
            [
                businessName,
                address,
                city,
                phone,
                email,
                website,
                taxId,
                logoUrl,
                showLogo ? 1 : 0,
                logoSize,
                logoWidth || 80,
                logoHeight || 80,
                logoMarginTop || 0,
                logoMarginBottom || 8,
                headerText,
                showHeader ? 1 : 0,
                headerAlign,
                footerText,
                showFooter ? 1 : 0,
                footerAlign,
                showTaxId ? 1 : 0,
                showWebsite ? 1 : 0,
                showEmail ? 1 : 0,
                paperSize,
                fontFamily,
                fontSize,
                additionalInfo,
                showOrderNumber ? 1 : 0,
                showDateTime ? 1 : 0,
                showCashier ? 1 : 0,
                showTableNumber ? 1 : 0,
                showQRCode ? 1 : 0,
                qrCodeData,
                qrCodeUrl,
                qrCodeWidth || 100,
                qrCodeHeight || 100,
                qrCodeMarginTop || 12,
                qrCodeMarginBottom || 0,
                req.user.id,
                merchantId,
            ]
        );

        const [updatedSettings] = await promisePool.query(
            'SELECT * FROM receipt_settings WHERE merchant_id = ?',
            [merchantId]
        );

        log.info(`Receipt settings updated by user: ${req.user.id} merchant: ${merchantId}`);

        sendSuccess(res, formatSettings(updatedSettings[0]), 'Receipt settings updated successfully');

    } catch (error) {
        log.error('Update receipt settings error:', error);
        sendError(res, 'Failed to update receipt settings', 500);
    }
};

// Upload logo
const uploadLogo = async (req, res) => {
    try {
        const merchantId = req.user.merchant_id;

        if (!req.file) {
            return sendError(res, 'No file uploaded', 400);
        }

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            await fs.unlink(req.file.path);
            return sendError(res, 'Invalid file type. Only images are allowed.', 400);
        }

        if (req.file.size > 2 * 1024 * 1024) {
            await fs.unlink(req.file.path);
            return sendError(res, 'File size must be less than 2MB', 400);
        }

        const [currentSettings] = await promisePool.query(
            'SELECT logo_url FROM receipt_settings WHERE merchant_id = ?',
            [merchantId]
        );

        if (currentSettings.length > 0 && currentSettings[0].logo_url) {
            const oldLogoPath = path.join(__dirname, '..', currentSettings[0].logo_url);
            try {
                await fs.unlink(oldLogoPath);
            } catch (error) {
                log.warn('Old logo file not found:', error.message);
            }
        }

        const logoUrl = `/uploads/logos/${req.file.filename}`;

        await promisePool.query(
            'UPDATE receipt_settings SET logo_url = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP, updated_date = NOW() WHERE merchant_id = ?',
            [logoUrl, req.user.id, merchantId]
        );

        log.info(`Logo uploaded by user: ${req.user.id} merchant: ${merchantId}`);

        sendSuccess(res, { logoUrl }, 'Logo uploaded successfully');

    } catch (error) {
        log.error('Upload logo error:', error);
        if (req.file) {
            try { await fs.unlink(req.file.path); } catch (_) {}
        }
        sendError(res, 'Failed to upload logo', 500);
    }
};

// Delete logo
const deleteLogo = async (req, res) => {
    try {
        const merchantId = req.user.merchant_id;

        const [currentSettings] = await promisePool.query(
            'SELECT logo_url FROM receipt_settings WHERE merchant_id = ?',
            [merchantId]
        );

        if (currentSettings.length > 0 && currentSettings[0].logo_url) {
            const logoPath = path.join(__dirname, '..', currentSettings[0].logo_url);
            try {
                await fs.unlink(logoPath);
            } catch (error) {
                log.warn('Logo file not found:', error.message);
            }
        }

        await promisePool.query(
            'UPDATE receipt_settings SET logo_url = NULL, updated_by = ?, updated_at = CURRENT_TIMESTAMP, updated_date = NOW() WHERE merchant_id = ?',
            [req.user.id, merchantId]
        );

        log.info(`Logo deleted by user: ${req.user.id} merchant: ${merchantId}`);

        sendSuccess(res, null, 'Logo deleted successfully');

    } catch (error) {
        log.error('Delete logo error:', error);
        sendError(res, 'Failed to delete logo', 500);
    }
};

// Upload QR code
const uploadQRCode = async (req, res) => {
    try {
        const merchantId = req.user.merchant_id;

        if (!req.file) {
            return sendError(res, 'No file uploaded', 400);
        }

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            await fs.unlink(req.file.path);
            return sendError(res, 'Invalid file type. Only images are allowed.', 400);
        }

        if (req.file.size > 2 * 1024 * 1024) {
            await fs.unlink(req.file.path);
            return sendError(res, 'File size must be less than 2MB', 400);
        }

        const [currentSettings] = await promisePool.query(
            'SELECT qr_code_url FROM receipt_settings WHERE merchant_id = ?',
            [merchantId]
        );

        if (currentSettings.length > 0 && currentSettings[0].qr_code_url) {
            const oldQRPath = path.join(__dirname, '..', currentSettings[0].qr_code_url);
            try {
                await fs.unlink(oldQRPath);
            } catch (error) {
                log.warn('Old QR code file not found:', error.message);
            }
        }

        const qrCodeUrl = `/uploads/qrcodes/${req.file.filename}`;

        await promisePool.query(
            'UPDATE receipt_settings SET qr_code_url = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP, updated_date = NOW() WHERE merchant_id = ?',
            [qrCodeUrl, req.user.id, merchantId]
        );

        log.info(`QR code uploaded by user: ${req.user.id} merchant: ${merchantId}`);

        sendSuccess(res, { qrCodeUrl }, 'QR code uploaded successfully');

    } catch (error) {
        log.error('Upload QR code error:', error);
        if (req.file) {
            try { await fs.unlink(req.file.path); } catch (_) {}
        }
        sendError(res, 'Failed to upload QR code', 500);
    }
};

// Delete QR code
const deleteQRCode = async (req, res) => {
    try {
        const merchantId = req.user.merchant_id;

        const [currentSettings] = await promisePool.query(
            'SELECT qr_code_url FROM receipt_settings WHERE merchant_id = ?',
            [merchantId]
        );

        if (currentSettings.length > 0 && currentSettings[0].qr_code_url) {
            const qrCodePath = path.join(__dirname, '..', currentSettings[0].qr_code_url);
            try {
                await fs.unlink(qrCodePath);
            } catch (error) {
                log.warn('QR code file not found:', error.message);
            }
        }

        await promisePool.query(
            'UPDATE receipt_settings SET qr_code_url = NULL, updated_by = ?, updated_at = CURRENT_TIMESTAMP, updated_date = NOW() WHERE merchant_id = ?',
            [req.user.id, merchantId]
        );

        log.info(`QR code deleted by user: ${req.user.id} merchant: ${merchantId}`);

        sendSuccess(res, null, 'QR code deleted successfully');

    } catch (error) {
        log.error('Delete QR code error:', error);
        sendError(res, 'Failed to delete QR code', 500);
    }
};

// Helper function to format settings
// merchant: row from merchants table (business info source of truth)
// payment: row from payment_settings table (QR source of truth)
const formatSettings = (dbRow, merchant = {}, payment = {}) => {
    return {
        id: dbRow.id,
        // Business info: merchants table is source of truth; fall back to receipt_settings
        businessName: merchant.business_name || dbRow.business_name || '',
        address:      merchant.address       || dbRow.address       || '',
        city:         dbRow.city             || '',
        phone:        merchant.phone         || dbRow.phone         || '',
        email:        merchant.email         || dbRow.email         || '',
        website:      merchant.website       || dbRow.website       || '',
        taxId:        merchant.tax_id        || dbRow.tax_id        || '',
        logoUrl: dbRow.logo_url,
        showLogo: Boolean(dbRow.show_logo),
        logoSize: dbRow.logo_size,
        logoWidth: dbRow.logo_width || 80,
        logoHeight: dbRow.logo_height || 80,
        logoMarginTop: dbRow.logo_margin_top || 0,
        logoMarginBottom: dbRow.logo_margin_bottom || 8,
        headerText: dbRow.header_text,
        showHeader: Boolean(dbRow.show_header),
        headerAlign: dbRow.header_align,
        footerText: dbRow.footer_text,
        showFooter: Boolean(dbRow.show_footer),
        footerAlign: dbRow.footer_align,
        showTaxId: Boolean(dbRow.show_tax_id),
        showWebsite: Boolean(dbRow.show_website),
        showEmail: Boolean(dbRow.show_email),
        paperSize: dbRow.paper_size,
        fontFamily: dbRow.font_family,
        fontSize: dbRow.font_size,
        additionalInfo: dbRow.additional_info,
        showOrderNumber: Boolean(dbRow.show_order_number),
        showDateTime: Boolean(dbRow.show_date_time),
        showCashier: Boolean(dbRow.show_cashier),
        showTableNumber: Boolean(dbRow.show_table_number),
        showQRCode: Boolean(dbRow.show_qr_code),
        qrCodeData: dbRow.qr_code_data,
        // QR code: payment_settings is source of truth; fall back to receipt_settings
        qrCodeUrl: payment.mobile_qr_url || dbRow.qr_code_url || null,
        qrCodeWidth: dbRow.qr_code_width || 100,
        qrCodeHeight: dbRow.qr_code_height || 100,
        qrCodeMarginTop: dbRow.qr_code_margin_top || 12,
        qrCodeMarginBottom: dbRow.qr_code_margin_bottom || 0,
        createdAt: dbRow.created_at,
        updatedAt: dbRow.updated_at,
    };
};

module.exports = {
    getSettings,
    updateSettings,
    uploadLogo,
    deleteLogo,
    uploadQRCode,
    deleteQRCode,
};
