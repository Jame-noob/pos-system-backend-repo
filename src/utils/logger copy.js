function getFormattedTimestamp() {
    const now = new Date();
    const timestamp =
        now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0') + ':' +
        String(now.getMilliseconds()).padStart(3, '0');

    return timestamp;
}

//   const timestamp = getFormattedTimestamp();
//   console.log(timestamp); // Correct Thailand time

const log = {
    info: (message, data = null) => {
        const timestamp = getFormattedTimestamp();//new Date().toUTCString();
        console.log(`[INFO] ${timestamp} - ${message}`);
        if (data) {
            console.log('Data:', JSON.stringify(data, null, 2));
        }
    },

    error: (message, error = null) => {
        const timestamp = getFormattedTimestamp();//new Date().toISOString();
        console.error(`[ERROR] ${timestamp} - ${message}`);
        if (error) {
            console.error('Error Details:', {
                message: error.message,
                code: error.code,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    },

    warn: (message, data = null) => {
        const timestamp = getFormattedTimestamp();//new Date().toISOString();
        console.warn(`[WARN] ${timestamp} - ${message}`);
        if (data) {
            console.warn('Data:', data);
        }
    },

    debug: (message, data = null) => {
        if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
            const timestamp = getFormattedTimestamp();//new Date().toISOString();
            console.debug(`[DEBUG] ${timestamp} - ${message}`);
            if (data) {
                console.debug('Data:', JSON.stringify(data, null, 2));
            }
        }
    },

    api: (req, message = '') => {
        const timestamp = getFormattedTimestamp();//new Date().toISOString();
        console.log(`[API] ${timestamp} - ${req.method} ${req.path} ${message}`);
    },

    db: (query, params = null) => {
        if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
            const timestamp = getFormattedTimestamp();//new Date().toISOString();
            console.log(`[DB] ${timestamp} - Query: ${query}`);
            if (params) {
                console.log('Params:', params);
            }
        }
    },

    success: (message, data = null) => {
        const timestamp = getFormattedTimestamp();//new Date().toISOString();
        console.log(`[SUCCESS] ${timestamp} - ✅ ${message}`);
        if (data) {
            console.log('Data:', data);
        }
    }
};

module.exports = log;