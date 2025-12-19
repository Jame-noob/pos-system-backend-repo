const jwt = require('jsonwebtoken');
const { promisePool } = require('../config/database');
const { sendError } = require('../utils/response');
const log = require('../utils/logger');

// Verify JWT token
const verifyToken = async (req, res, next) => {
    try {
        log.api(req, '- Verifying token');

        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            log.warn(`No token provided for ${req.method} ${req.path}`);
            return sendError(res, 'No token provided', 401);
        }

        const token = authHeader.substring(7);
        log.debug('Token received', { tokenPreview: token.substring(0, 20) + '...' });

        // Verify token
        let decoded = null;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
            log.debug('Token decoded', { userId: decoded.userId, role: decoded.role });
        } catch (error) {
            log.warn('Token verification failed', { error: error.message });
            if (error.name === 'JsonWebTokenError') {
                log.warn('Invalid JWT token', { error: error.message });
                return sendError(res, 'Invalid token', 401);
            }
            if (error.name === 'TokenExpiredError') {
                log.warn('JWT token expired');
                return sendError(res, 'Token expired', 401);
            }
        }


        // Check if user exists
        const [users] = await promisePool.query(
            'SELECT id, username, email, full_name, role, is_active FROM users WHERE id = ? AND deleted_at IS NULL',
            [decoded.userId]
        );

        if (users.length === 0) {
            log.warn(`User not found: userId=${decoded.userId}`);
            return sendError(res, 'User not found', 404);
        }

        const user = users[0];

        if (!user.is_active) {
            log.warn(`Inactive user attempted access: ${user.username}`);
            return sendError(res, 'User account is inactive', 403);
        }

        req.user = user;
        log.debug('User authenticated', { username: user.username, role: user.role });
        next();

    } catch (error) {

        log.error('Authentication failed', error);
        return sendError(res, 'Authentication failed', 500);
    }
};

// Check if user has required role
const checkRole = (...roles) => {
    return (req, res, next) => {
        log.debug(`Checking role: Required [${roles.join(', ')}], User has: ${req.user?.role}`);

        if (!req.user) {
            log.warn('No user in request for role check');
            return sendError(res, 'Authentication required', 401);
        }

        if (!roles.includes(req.user.role)) {
            log.warn(`Insufficient permissions: User ${req.user.username} (${req.user.role}) attempted to access [${roles.join(', ')}] only route`);
            return sendError(res, 'Insufficient permissions', 403);
        }

        log.debug(`Role check passed for user: ${req.user.username}`);
        next();
    };
};

module.exports = {
    verifyToken,
    checkRole
};