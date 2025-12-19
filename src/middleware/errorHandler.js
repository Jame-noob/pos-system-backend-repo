const { sendError } = require('../utils/response');
const log = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    log.error(`Error in ${req.method} ${req.path}`, err);

    // MySQL errors
    if (err.code === 'ER_DUP_ENTRY') {
        log.warn('Duplicate entry error', { path: req.path });
        return sendError(res, 'Duplicate entry. Record already exists.', 409);
    }

    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
        log.warn('Referenced row not found', { path: req.path });
        return sendError(res, 'Referenced record does not exist.', 400);
    }

    // Validation errors
    if (err.name === 'ValidationError') {
        log.warn('Validation error', { message: err.message });
        return sendError(res, err.message, 400);
    }

    // Default error
    log.error('Unhandled error', {
        message: err.message,
        statusCode: err.statusCode,
        path: req.path
    });

    return sendError(res, err.message || 'Internal server error', err.statusCode || 500);
};

const notFound = (req, res) => {
    log.warn(`Route not found: ${req.method} ${req.originalUrl}`);
    sendError(res, `Route ${req.originalUrl} not found`, 404);
};

module.exports = {
    errorHandler,
    notFound
};