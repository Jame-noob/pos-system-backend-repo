const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');

// Login
const login = async (req, res) => {
    try {
        log.info('=== LOGIN ATTEMPT ===');
        const { username, password } = req.body;
        log.debug('Login attempt', { username });

        // Find user
        log.db('SELECT user by username/email', [username]);
        const [users] = await promisePool.query(
            `SELECT id, username, email, password_hash, full_name, role, is_active 
             FROM users 
             WHERE (username = ? OR email = ?) AND deleted_at IS NULL`,
            [username, username]
        );

        if (users.length === 0) {
            log.warn(`Login failed: User not found - ${username}`);
            return sendError(res, 'Invalid credentials', 401);
        }

        const user = users[0];
        log.debug('User found', { id: user.id, username: user.username, role: user.role });

        // Check if user is active
        if (!user.is_active) {
            log.warn(`Login failed: Inactive account - ${username}`);
            return sendError(res, 'Account is inactive', 403);
        }

        // Verify password
        log.debug('Verifying password...');
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            log.warn(`Login failed: Invalid password - ${username}`);
            return sendError(res, 'Invalid credentials', 401);
        }

        log.debug('Password verified successfully');

        // Update last login
        log.db('UPDATE last_login_at', [user.id]);
        await promisePool.query(
            'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '60s' }
        );

        log.debug('JWT token generated', { tokenPreview: token.substring(0, 20) + '...' });

        // Remove password from response
        delete user.password_hash;

        log.success(`User logged in successfully: ${user.username} (${user.role})`);

        sendSuccess(res, {
            user,
            token
        }, 'Login successful');

    } catch (error) {
        log.error('Login error', error);
        sendError(res, 'Login failed', 500);
    }
};

// Get current user profile
const getProfile = async (req, res) => {
    try {
        log.info('=== GET PROFILE ===');
        log.debug('Fetching profile for user', { userId: req.user.id });

        const [users] = await promisePool.query(
            `SELECT id, username, email, full_name, role, is_active, last_login_at, created_at 
             FROM users 
             WHERE id = ? AND deleted_at IS NULL`,
            [req.user.id]
        );

        if (users.length === 0) {
            log.warn('User not found in database', { userId: req.user.id });
            return sendError(res, 'User not found', 404);
        }

        log.success('Profile retrieved', { username: users[0].username });
        sendSuccess(res, users[0], 'Profile retrieved successfully');

    } catch (error) {
        log.error('Get profile error', error);
        sendError(res, 'Failed to retrieve profile', 500);
    }
};

// Change password
const changePassword = async (req, res) => {
    try {
        log.info('=== CHANGE PASSWORD ===');
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;
        log.debug('Password change attempt', { userId });

        // Get current password hash
        const [users] = await promisePool.query(
            'SELECT password_hash FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            log.warn('User not found for password change', { userId });
            return sendError(res, 'User not found', 404);
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, users[0].password_hash);

        if (!isPasswordValid) {
            log.warn('Password change failed: Invalid current password', { userId });
            return sendError(res, 'Current password is incorrect', 401);
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await promisePool.query(
            'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [hashedPassword, userId]
        );

        log.success(`Password changed successfully for user ID: ${userId}`);

        sendSuccess(res, null, 'Password changed successfully');

    } catch (error) {
        log.error('Change password error', error);
        sendError(res, 'Failed to change password', 500);
    }
};

module.exports = {
    login,
    getProfile,
    changePassword
};