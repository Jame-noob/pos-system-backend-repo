const { validationResult } = require('express-validator');
const { sendError } = require('../utils/response');

const validate = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg);
        console.log(errorMessages);

        return sendError(res, errorMessages.join(', '), 400);
    }

    next();
};

module.exports = validate;