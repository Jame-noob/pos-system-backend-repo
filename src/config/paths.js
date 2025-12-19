const path = require('path');

module.exports = {
    // Physical paths on server (absolute paths)
    ROOT_DIR: path.join(__dirname, '..'),
    UPLOADS_DIR: path.join(__dirname, '..', 'uploads'),
    PRODUCTS_UPLOADS_DIR: path.join(__dirname, '..', 'uploads', 'products'),
    CATEGORIES_UPLOADS_DIR: path.join(__dirname, '..', 'uploads', 'categories'),
    QRCODE_DIR: path.join(__dirname, '..', 'uploads', 'qrcodes'),

    // URL paths for frontend (relative paths)
    UPLOADS_URL: '/uploads',
    PRODUCTS_UPLOADS_URL: '/uploads/products',
    CATEGORIES_UPLOADS_URL: '/uploads/categories',
    QRCODE_URL: '/uploads/qrcodes',

    // Ensure directories exist
    ensureDirectories() {
        const fs = require('fs');
        const dirs = [
            this.UPLOADS_DIR,
            this.PRODUCTS_UPLOADS_DIR,
            this.CATEGORIES_UPLOADS_DIR,
            this.QRCODE_DIR,
        ];

        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`✅ Created directory: ${dir}`);
            }
        });
    }
};