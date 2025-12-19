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

// Function to get caller information
function getCallerInfo() {
    // Create an error to capture the stack trace
    const stack = new Error().stack;
    
    // Split stack into lines and find the caller (skip the first line for this function itself)
    const stackLines = stack.split('\n');
    
    // Find the line that called our logger function
    // We look for the first line that doesn't contain our logger file
    for (let i = 3; i < stackLines.length; i++) { // Start from 3 to skip Error constructor and getCallerInfo
        const line = stackLines[i].trim();
        // Skip lines that contain our logger functions or node internals
        if (!line.includes('at Object.') && 
            !line.includes('at log.') && 
            !line.includes('getCallerInfo') &&
            !line.includes('node:internal') &&
            !line.includes('at Module.')) {
            
            // Extract function name and file info
            const match = line.match(/at (.+?) \((.+):(\d+):(\d+)\)/);
            if (match) {
                const functionName = match[1];
                const fileName = match[2].split('/').pop(); // Get just the filename
                const lineNumber = match[3];
                return { functionName, fileName, lineNumber };
            } else {
                // Handle anonymous functions or different stack format
                const anonymousMatch = line.match(/at (.+):(\d+):(\d+)/);
                if (anonymousMatch) {
                    const fileName = anonymousMatch[1].split('/').pop();
                    const lineNumber = anonymousMatch[2];
                    return { functionName: 'anonymous', fileName, lineNumber };
                }
            }
        }
    }
    
    return { functionName: 'unknown', fileName: 'unknown', lineNumber: '0' };
}

const log = {
    info: (message, data = null) => {
        const timestamp = getFormattedTimestamp();
        const caller = getCallerInfo();
        console.log(`[INFO] ${timestamp} - ${caller.fileName}:${caller.functionName}(${caller.lineNumber}) - ${message}`);
        if (data) {
            console.log('Data:', JSON.stringify(data, null, 2));
        }
    },

    error: (message, error = null) => {
        const timestamp = getFormattedTimestamp();
        const caller = getCallerInfo();
        console.error(`[ERROR] ${timestamp} - ${caller.fileName}:${caller.functionName}(${caller.lineNumber}) - ${message}`);
        if (error) {
            console.error('Error Details:', {
                message: error.message,
                code: error.code,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    },

    warn: (message, data = null) => {
        const timestamp = getFormattedTimestamp();
        const caller = getCallerInfo();
        console.warn(`[WARN] ${timestamp} - ${caller.fileName}:${caller.functionName}(${caller.lineNumber}) - ${message}`);
        if (data) {
            console.warn('Data:', data);
        }
    },

    debug: (message, data = null) => {
        if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
            const timestamp = getFormattedTimestamp();
            const caller = getCallerInfo();
            console.debug(`[DEBUG] ${timestamp} - ${caller.fileName}:${caller.functionName}(${caller.lineNumber}) - ${message}`);
            if (data) {
                console.debug('Data:', JSON.stringify(data, null, 2));
            }
        }
    },

    api: (req, message = '') => {
        const timestamp = getFormattedTimestamp();
        const caller = getCallerInfo();
        console.log(`[API] ${timestamp} - ${caller.fileName}:${caller.functionName}(${caller.lineNumber}) - ${req.method} ${req.path} ${message}`);
    },

    db: (query, params = null) => {
        if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
            const timestamp = getFormattedTimestamp();
            const caller = getCallerInfo();
            console.log(`[DB] ${timestamp} - ${caller.fileName}:${caller.functionName}(${caller.lineNumber}) - Query: ${query}`);
            if (params) {
                console.log('Params:', params);
            }
        }
    },

    success: (message, data = null) => {
        const timestamp = getFormattedTimestamp();
        const caller = getCallerInfo();
        console.log(`[SUCCESS] ${timestamp} - ${caller.fileName}:${caller.functionName}(${caller.lineNumber}) - ✅ ${message}`);
        if (data) {
            console.log('Data:', data);
        }
    }
};

module.exports = log;