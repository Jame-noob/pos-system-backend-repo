const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const log = require('./utils/logger');
const paths = require('./config/paths');

// Import routes
const authRoutes = require('./routes/auth.routes');
const productsRoutes = require('./routes/products.routes');
const categoriesRoutes = require('./routes/categories.routes');
const ordersRoutes = require('./routes/orders.routes');
const tablesRoutes = require('./routes/tables.routes');
const paymentsRoutes = require('./routes/payments.routes');
const reportsRoutes = require('./routes/reports.routes');
const settingsRoutes = require('./routes/settings.routes');
const uploadRoutes = require('./routes/upload.routes');
const receiptSettingsRoutes = require('./routes/receiptSettings.routes');
const productImportRoutes = require('./routes/productImport.routes');
const qrCodeRoutes = require('./routes/qrcode.routes');

// Create Express app
const app = express();

// Ensure upload directories exist
paths.ensureDirectories();

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',//['http://192.168.100.42:3000','http://localhost:3000','http://103.43.76.77:3000'],
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files for uploads
app.use(paths.UPLOADS_URL, express.static(paths.UPLOADS_DIR));
log.info(`📁 Static files served from: ${paths.UPLOADS_DIR} at ${paths.UPLOADS_URL}`);

// Add request logger (only in development)
if (process.env.NODE_ENV === 'development') {
    app.use(requestLogger);
}

// API prefix
const API_PREFIX = process.env.API_PREFIX || '/api/v1';

log.info(`🚀 API Base Path: ${API_PREFIX}`);

// Health check endpoint
app.get(`${API_PREFIX}/health`, (req, res) => {
    res.json({
        success: true,
        message: 'POS API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        uploads: {
            url: paths.UPLOADS_URL,
            directory: paths.UPLOADS_DIR
        }
    });
});

// Routes
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/products`, productsRoutes);
app.use(`${API_PREFIX}/categories`, categoriesRoutes);
app.use(`${API_PREFIX}/orders`, ordersRoutes);
app.use(`${API_PREFIX}/tables`, tablesRoutes);
app.use(`${API_PREFIX}/payments`, paymentsRoutes);
app.use(`${API_PREFIX}/reports`, reportsRoutes);
app.use(`${API_PREFIX}/settings`, settingsRoutes);
app.use(`${API_PREFIX}/upload`, uploadRoutes);
app.use(`${API_PREFIX}/receipt-settings`, receiptSettingsRoutes);
app.use(`${API_PREFIX}/products/bulk`, productImportRoutes);
app.use(`${API_PREFIX}/qrcode`, qrCodeRoutes);


const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));
app.use('/api/v1/uploads', express.static(path.join(__dirname, 'uploads')));
log.info('✅ Static files served at /uploads');
// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;