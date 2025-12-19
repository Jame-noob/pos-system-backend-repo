const log = require('../utils/logger');

const requestLogger = (req, res, next) => {
    const start = Date.now();

    // Log incoming request
    log.info(`➡️  ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')?.substring(0, 50)
    });

    // Log query params if any
    if (Object.keys(req.query).length > 0) {
        log.debug('Query params', req.query);
    }

    // Log body for POST/PUT/PATCH (excluding sensitive data)
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const sanitizedBody = { ...req.body };
        if (sanitizedBody.password) sanitizedBody.password = '***';
        if (sanitizedBody.currentPassword) sanitizedBody.currentPassword = '***';
        if (sanitizedBody.newPassword) sanitizedBody.newPassword = '***';
        log.debug('Request body', sanitizedBody);
    }

    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - start;
        const statusEmoji = res.statusCode < 400 ? '✅' : '❌';
        log.info(`⬅️  ${statusEmoji} ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    });

    next();
};

module.exports = requestLogger;