const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');

// Key → merchants column
const MERCHANT_KEYS = {
    general_business_name: 'business_name',
    general_address:       'address',
    general_phone:         'phone',
    general_email:         'email',
    general_website:       'website',
    general_tax_id:        'tax_id',
    general_currency:      'currency',
    general_tax_rate:      'tax_rate',
};

// Key → printer_settings column
const PRINTER_KEYS = {
    printer_type:       'printer_type',
    printer_name:       'printer_name',
    printer_copies:     'printer_copies',
    printer_auto_print: 'auto_print',
};

// Key → payment_settings column
const PAYMENT_KEYS = {
    payment_cash_enabled:       'cash_enabled',
    payment_card_enabled:       'card_enabled',
    payment_mobile_enabled:     'mobile_enabled',
    payment_mobile_qr_url:      'mobile_qr_url',
    payment_mobile_qr_filename: 'mobile_qr_filename',
};

const parseSettingValue = (setting) => {
    let value = setting.setting_value;
    if (setting.setting_type === 'number') {
        value = parseFloat(value);
    } else if (setting.setting_type === 'boolean') {
        value = value === 'true';
    } else if (setting.setting_type === 'json') {
        try { value = JSON.parse(value); } catch (e) { value = setting.setting_value; }
    }
    return value;
};

// Upsert helper for single-row-per-merchant tables
const upsertMerchantTable = async (connection, table, merchantId, data) => {
    const columns = ['merchant_id', ...Object.keys(data)];
    const values = [merchantId, ...Object.values(data)];
    const setClauses = Object.keys(data).map(col => `${col} = VALUES(${col})`).join(', ');

    await connection.query(
        `INSERT INTO ${table} (${columns.join(', ')})
         VALUES (${columns.map(() => '?').join(', ')})
         ON DUPLICATE KEY UPDATE ${setClauses}, updated_at = CURRENT_TIMESTAMP`,
        values
    );
};

// Get all settings
const getAllSettings = async (req, res) => {
    try {
        const merchantId = req.user.merchant_id;

        const [[merchants], [printers], [payments], [settings]] = await Promise.all([
            promisePool.query(
                'SELECT business_name, address, phone, email, website, tax_id, currency, tax_rate FROM merchants WHERE merchant_id = ?',
                [merchantId]
            ),
            promisePool.query(
                'SELECT printer_type, printer_name, printer_copies, auto_print FROM printer_settings WHERE merchant_id = ?',
                [merchantId]
            ),
            promisePool.query(
                'SELECT cash_enabled, card_enabled, mobile_enabled, mobile_qr_url, mobile_qr_filename FROM payment_settings WHERE merchant_id = ?',
                [merchantId]
            ),
            promisePool.query(
                'SELECT * FROM settings WHERE merchant_id = ? ORDER BY setting_key ASC',
                [merchantId]
            ),
        ]);

        const m = merchants[0] || {};
        const p = printers[0]  || {};
        const pay = payments[0] || {};

        const settingsObj = {
            // General — from merchants
            general_business_name: m.business_name || '',
            general_address:       m.address       || '',
            general_phone:         m.phone         || '',
            general_email:         m.email         || '',
            general_website:       m.website       || '',
            general_tax_id:        m.tax_id        || '',
            general_currency:      m.currency      || 'LAK',
            general_tax_rate:      m.tax_rate      || '10',

            // Printer — from printer_settings
            printer_type:       p.printer_type   || 'thermal',
            printer_name:       p.printer_name   || '',
            printer_copies:     p.printer_copies || 1,
            printer_auto_print: Boolean(p.auto_print),

            // Payment — from payment_settings
            payment_cash_enabled:       Boolean(pay.cash_enabled   ?? 1),
            payment_card_enabled:       Boolean(pay.card_enabled   ?? 0),
            payment_mobile_enabled:     Boolean(pay.mobile_enabled ?? 0),
            payment_mobile_qr_url:      pay.mobile_qr_url      || '',
            payment_mobile_qr_filename: pay.mobile_qr_filename || '',
        };

        // Remaining misc settings from settings table
        settings.forEach(s => {
            settingsObj[s.setting_key] = parseSettingValue(s);
        });

        sendSuccess(res, settingsObj, 'Settings retrieved successfully');
    } catch (error) {
        log.error('Get settings error:', error);
        sendError(res, 'Failed to retrieve settings', 500);
    }
};

// Update multiple settings
const updateMultipleSettings = async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        await connection.beginTransaction();

        const { settings } = req.body;
        const merchantId = req.user.merchant_id;

        if (!settings || typeof settings !== 'object') {
            return sendError(res, 'Invalid settings format', 400);
        }

        const merchantData  = {};
        const printerData   = {};
        const paymentData   = {};
        const miscEntries   = [];

        for (const [key, value] of Object.entries(settings)) {
            if (MERCHANT_KEYS[key]) {
                merchantData[MERCHANT_KEYS[key]] = value ?? '';
            } else if (PRINTER_KEYS[key]) {
                printerData[PRINTER_KEYS[key]] = value;
            } else if (PAYMENT_KEYS[key]) {
                paymentData[PAYMENT_KEYS[key]] = value;
            } else {
                miscEntries.push([key, value]);
            }
        }

        if (Object.keys(merchantData).length > 0) {
            const businessName = merchantData.business_name || '';
            const columns = ['merchant_id', 'merchant_name', 'merchant_name_la', 'created_by', 'created_date', ...Object.keys(merchantData)];
            const values  = [merchantId, businessName, businessName, String(merchantId), new Date(), ...Object.values(merchantData)];
            const setClauses = Object.keys(merchantData).map(col => `${col} = VALUES(${col})`).join(', ');
            await connection.query(
                `INSERT INTO merchants (${columns.join(', ')})
                 VALUES (${columns.map(() => '?').join(', ')})
                 ON DUPLICATE KEY UPDATE ${setClauses}, updated_at = CURRENT_TIMESTAMP`,
                values
            );
        }

        if (Object.keys(printerData).length > 0) {
            await upsertMerchantTable(connection, 'printer_settings', merchantId, printerData);
        }

        if (Object.keys(paymentData).length > 0) {
            await upsertMerchantTable(connection, 'payment_settings', merchantId, paymentData);
        }

        for (const [key, value] of miscEntries) {
            const settingType = typeof value === 'boolean' ? 'boolean'
                : typeof value === 'number' ? 'number'
                : typeof value === 'object' ? 'json'
                : 'string';

            let valueToStore = value;
            if (settingType === 'json') {
                valueToStore = JSON.stringify(value);
            } else if (settingType === 'boolean') {
                valueToStore = value ? 'true' : 'false';
            } else {
                valueToStore = value !== null && value !== undefined ? value.toString() : '';
            }

            await connection.query(
                `INSERT INTO settings (setting_key, setting_value, setting_type, merchant_id)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), merchant_id = VALUES(merchant_id), updated_at = CURRENT_TIMESTAMP`,
                [key, valueToStore, settingType, merchantId]
            );
        }

        await connection.commit();
        log.info(`Multiple settings updated: ${Object.keys(settings).join(', ')}`);
        sendSuccess(res, settings, 'Settings updated successfully');
    } catch (error) {
        await connection.rollback();
        log.error('Update multiple settings error:', error);
        sendError(res, 'Failed to update settings', 500);
    } finally {
        connection.release();
    }
};

// Get setting by key
const getSettingByKey = async (req, res) => {
    try {
        const { key } = req.params;
        const merchantId = req.user.merchant_id;

        if (MERCHANT_KEYS[key]) {
            const col = MERCHANT_KEYS[key];
            const [rows] = await promisePool.query(`SELECT ${col} as value FROM merchants WHERE merchant_id = ?`, [merchantId]);
            if (rows.length === 0) return sendError(res, 'Merchant not found', 404);
            return sendSuccess(res, { key, value: rows[0].value }, 'Setting retrieved successfully');
        }

        if (PRINTER_KEYS[key]) {
            const col = PRINTER_KEYS[key];
            const [rows] = await promisePool.query(`SELECT ${col} as value FROM printer_settings WHERE merchant_id = ?`, [merchantId]);
            return sendSuccess(res, { key, value: rows[0]?.value ?? null }, 'Setting retrieved successfully');
        }

        if (PAYMENT_KEYS[key]) {
            const col = PAYMENT_KEYS[key];
            const [rows] = await promisePool.query(`SELECT ${col} as value FROM payment_settings WHERE merchant_id = ?`, [merchantId]);
            return sendSuccess(res, { key, value: rows[0]?.value ?? null }, 'Setting retrieved successfully');
        }

        const [settings] = await promisePool.query(
            'SELECT * FROM settings WHERE setting_key = ? AND merchant_id = ?',
            [key, merchantId]
        );
        if (settings.length === 0) return sendError(res, 'Setting not found', 404);
        sendSuccess(res, { key, value: parseSettingValue(settings[0]) }, 'Setting retrieved successfully');
    } catch (error) {
        log.error('Get setting error:', error);
        sendError(res, 'Failed to retrieve setting', 500);
    }
};

// Update single setting
const updateSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        const merchantId = req.user.merchant_id;

        if (MERCHANT_KEYS[key]) {
            const col = MERCHANT_KEYS[key];
            await promisePool.query(`UPDATE merchants SET ${col} = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?`, [value, merchantId]);
            return sendSuccess(res, { key, value }, 'Setting updated successfully');
        }

        if (PRINTER_KEYS[key]) {
            const connection = await promisePool.getConnection();
            try {
                await upsertMerchantTable(connection, 'printer_settings', merchantId, { [PRINTER_KEYS[key]]: value });
            } finally { connection.release(); }
            return sendSuccess(res, { key, value }, 'Setting updated successfully');
        }

        if (PAYMENT_KEYS[key]) {
            const connection = await promisePool.getConnection();
            try {
                await upsertMerchantTable(connection, 'payment_settings', merchantId, { [PAYMENT_KEYS[key]]: value });
            } finally { connection.release(); }
            return sendSuccess(res, { key, value }, 'Setting updated successfully');
        }

        const [existing] = await promisePool.query(
            'SELECT id, setting_type FROM settings WHERE setting_key = ? AND merchant_id = ?',
            [key, merchantId]
        );
        if (existing.length === 0) return sendError(res, 'Setting not found', 404);

        let valueToStore = value;
        if (existing[0].setting_type === 'json') valueToStore = JSON.stringify(value);
        else if (existing[0].setting_type === 'boolean') valueToStore = value ? 'true' : 'false';
        else valueToStore = value.toString();

        await promisePool.query(
            'UPDATE settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ? AND merchant_id = ?',
            [valueToStore, key, merchantId]
        );

        log.info(`Setting updated: ${key} = ${valueToStore}`);
        sendSuccess(res, { key, value }, 'Setting updated successfully');
    } catch (error) {
        log.error('Update setting error:', error);
        sendError(res, 'Failed to update setting', 500);
    }
};

// Create new misc setting
const createSetting = async (req, res) => {
    try {
        const { setting_key, setting_value, setting_type, description, is_public } = req.body;
        const merchantId = req.user.merchant_id;

        const [result] = await promisePool.query(
            `INSERT INTO settings (setting_key, setting_value, setting_type, description, is_public, merchant_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [setting_key, setting_value, setting_type || 'string', description || null, is_public || false, merchantId]
        );

        const [newSetting] = await promisePool.query('SELECT * FROM settings WHERE id = ?', [result.insertId]);
        log.info(`Setting created: ${setting_key}`);
        sendSuccess(res, newSetting[0], 'Setting created successfully', 201);
    } catch (error) {
        log.error('Create setting error:', error);
        if (error.code === 'ER_DUP_ENTRY') return sendError(res, 'Setting key already exists', 409);
        sendError(res, 'Failed to create setting', 500);
    }
};

module.exports = {
    getAllSettings,
    getSettingByKey,
    updateSetting,
    updateMultipleSettings,
    createSetting
};
