const app = require('./src/app');
const { testConnection } = require('./src/config/database');
const log = require('./src/utils/logger');

const PORT = process.env.PORT || 5000;

// Test database connection
testConnection();

// Start server
app.listen(PORT, () => {
    log.info(`🚀 Server is running on port ${PORT}`);
    log.info(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    log.info(`🔗 API URL: http://localhost:${PORT}${process.env.API_PREFIX || '/api/v1'}`);
});