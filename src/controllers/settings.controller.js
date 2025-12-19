const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');

// Get all settings
const getAllSettings = async (req, res) => {
    try {
        const [settings] = await promisePool.query(
            'SELECT * FROM settings ORDER BY setting_key ASC'
        );

        // Convert to key-value object
        const settingsObj = {};
        settings.forEach(setting => {
            let value = setting.setting_value;

            // Parse value based on type
            if (setting.setting_type === 'number') {
                value = parseFloat(value);
            } else if (setting.setting_type === 'boolean') {
                value = value === 'true';
            } else if (setting.setting_type === 'json') {
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    value = setting.setting_value;
                }
            }

            settingsObj[setting.setting_key] = value;
        });

        sendSuccess(res, settingsObj, 'Settings retrieved successfully');

    } catch (error) {
        log.error('Get settings error:', error);
        sendError(res, 'Failed to retrieve settings', 500);
    }
};

// Get setting by key
const getSettingByKey = async (req, res) => {
    try {
        const { key } = req.params;

        const [settings] = await promisePool.query(
            'SELECT * FROM settings WHERE setting_key = ?',
            [key]
        );

        if (settings.length === 0) {
            return sendError(res, 'Setting not found', 404);
        }

        const setting = settings[0];
        let value = setting.setting_value;

        // Parse value based on type
        if (setting.setting_type === 'number') {
            value = parseFloat(value);
        } else if (setting.setting_type === 'boolean') {
            value = value === 'true';
        } else if (setting.setting_type === 'json') {
            try {
                value = JSON.parse(value);
            } catch (e) {
                value = setting.setting_value;
            }
        }

        sendSuccess(res, { key: setting.setting_key, value }, 'Setting retrieved successfully');

    } catch (error) {
        log.error('Get setting error:', error);
        sendError(res, 'Failed to retrieve setting', 500);
    }
};

// Update setting
const updateSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        // Check if setting exists
        const [existing] = await promisePool.query(
            'SELECT id, setting_type FROM settings WHERE setting_key = ?',
            [key]
        );

        if (existing.length === 0) {
            return sendError(res, 'Setting not found', 404);
        }

        let valueToStore = value;

        // Convert value to string based on type
        if (existing[0].setting_type === 'json') {
            valueToStore = JSON.stringify(value);
        } else if (existing[0].setting_type === 'boolean') {
            valueToStore = value ? 'true' : 'false';
        } else {
            valueToStore = value.toString();
        }

        await promisePool.query(
            'UPDATE settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
            [valueToStore, key]
        );

        log.info(`Setting updated: ${key} = ${valueToStore}`);

        sendSuccess(res, { key, value }, 'Setting updated successfully');

    } catch (error) {
        log.error('Update setting error:', error);
        sendError(res, 'Failed to update setting', 500);
    }
};

// Update multiple settings
const updateMultipleSettings = async (req, res) => {
    const connection = await promisePool.getConnection();

    try {
        await connection.beginTransaction();

        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            return sendError(res, 'Invalid settings format', 400);
        }

        for (const [key, value] of Object.entries(settings)) {
            // Get setting type
            const [existing] = await connection.query(
                'SELECT setting_type FROM settings WHERE setting_key = ?',
                [key]
            );

            if (existing.length > 0) {
                let valueToStore = value;

                // Convert value to string based on type
                if (existing[0].setting_type === 'json') {
                    valueToStore = JSON.stringify(value);
                } else if (existing[0].setting_type === 'boolean') {
                    valueToStore = value ? 'true' : 'false';
                } else {
                    valueToStore = value.toString();
                }

                await connection.query(
                    'UPDATE settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?',
                    [valueToStore, key]
                );
            }
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

// Create new setting
const createSetting = async (req, res) => {
    try {
        const { setting_key, setting_value, setting_type, description, is_public } = req.body;

        const [result] = await promisePool.query(
            `INSERT INTO settings (setting_key, setting_value, setting_type, description, is_public) 
             VALUES (?, ?, ?, ?, ?)`,
            [setting_key, setting_value, setting_type || 'string', description || null, is_public || false]
        );

        const [newSetting] = await promisePool.query(
            'SELECT * FROM settings WHERE id = ?',
            [result.insertId]
        );

        log.info(`Setting created: ${setting_key}`);

        sendSuccess(res, newSetting[0], 'Setting created successfully', 201);

    } catch (error) {
        log.error('Create setting error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return sendError(res, 'Setting key already exists', 409);
        }
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