// backend/controllers/productImport.controller.js

const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');
const fs = require('fs').promises;
const csv = require('csv-parser');
const path = require('path');

// Parse CSV file
const parseCSV = (filePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        const errors = [];
        let rowNumber = 0;

        require('fs').createReadStream(filePath)
            .pipe(csv({
                bom: true,
                mapHeaders: ({ header }) => header.replace(/^[^a-zA-Z\u0E80-\u0EFF_]+/, '').trim(),
            }))
            .on('data', (data) => {
                rowNumber++;
                results.push({ ...data, rowNumber });
            })
            .on('error', (error) => {
                reject(error);
            })
            .on('end', () => {
                resolve({ results, errors });
            });
    });
};

// Validate product row
const validateProductRow = (row, rowNumber) => {
    const errors = [];

    // Required fields
    if (!row.name || row.name.trim() === '') {
        errors.push(`Row ${rowNumber}: Product name is required`);
    }
    if (!row.price || isNaN(parseFloat(row.price))) {
        errors.push(`Row ${rowNumber}: Valid price is required`);
    }
    if (!row.category_id || isNaN(parseInt(row.category_id))) {
        errors.push(`Row ${rowNumber}: Valid category_id is required`);
    }

    // Optional numeric fields
    if (row.stock_quantity && row.stock_quantity !== '' && isNaN(parseInt(row.stock_quantity))) {
        errors.push(`Row ${rowNumber}: Stock quantity must be a number`);
    }
    if (row.low_stock_threshold && row.low_stock_threshold !== '' && isNaN(parseInt(row.low_stock_threshold))) {
        errors.push(`Row ${rowNumber}: Low stock threshold must be a number`);
    }
    if (row.cost_price && row.cost_price !== '' && isNaN(parseFloat(row.cost_price))) {
        errors.push(`Row ${rowNumber}: Cost price must be a valid number`);
    }

    return errors;
};

// Import products from CSV
const importProducts = async (req, res) => {
    let importId = null;
    let filePath = null;

    try {
        if (!req.file) {
            return sendError(res, 'No file uploaded', 400);
        }

        filePath = req.file.path;

        // Validate file type
        if (!req.file.originalname.endsWith('.csv')) {
            await fs.unlink(filePath);
            return sendError(res, 'Only CSV files are allowed', 400);
        }

        // Create import record
        const [importResult] = await promisePool.query(
            `INSERT INTO product_imports (filename, status, created_by) VALUES (?, 'processing', ?)`,
            [req.file.originalname, req.user.id]
        );
        importId = importResult.insertId;

        // Parse CSV
        log.info(`[IMPORT] Parsing CSV: ${req.file.originalname} | user: ${req.user.id} | merchant: ${req.user.merchant_id}`);
        const { results } = await parseCSV(filePath);

        log.info(`[IMPORT] Parsed ${results.length} rows`);
        if (results.length > 0) {
            log.info(`[IMPORT] CSV headers detected: ${Object.keys(results[0]).filter(k => k !== 'rowNumber').join(', ')}`);
        }

        if (results.length === 0) {
            await promisePool.query(
                `UPDATE product_imports SET status = 'failed', error_log = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                ['CSV file is empty', importId]
            );
            await fs.unlink(filePath);
            return sendError(res, 'CSV file is empty', 400);
        }

        // Update total rows
        await promisePool.query(
            `UPDATE product_imports SET total_rows = ? WHERE id = ?`,
            [results.length, importId]
        );

        let successCount = 0;
        let failCount = 0;
        const errors = [];

        // Process each row
        for (const row of results) {
            log.info(`[IMPORT] Row ${row.rowNumber}: name="${row.name}" price="${row.price}" category_id="${row.category_id}"`);
            try {
                // Validate row
                const validationErrors = validateProductRow(row, row.rowNumber);
                if (validationErrors.length > 0) {
                    failCount++;
                    log.warn(`[IMPORT] Row ${row.rowNumber}: validation failed → ${validationErrors.join(', ')}`);
                    for (const error of validationErrors) {
                        errors.push({ rowNumber: row.rowNumber, error, rowData: row });
                        // Use backticks for column names
                        await promisePool.query(
                            `INSERT INTO product_import_errors (import_id, \`row_number\`, error_message, row_data) VALUES (?, ?, ?, ?)`,
                            [importId, row.rowNumber, error, JSON.stringify(row)]
                        );
                    }
                    continue;
                }

                // Check if category exists (scoped to merchant)
                const [categories] = await promisePool.query(
                    'SELECT id FROM categories WHERE id = ? AND merchant_id = ? AND deleted_at IS NULL',
                    [parseInt(row.category_id), req.user.merchant_id]
                );
                log.info(`[IMPORT] Row ${row.rowNumber}: category check id=${row.category_id} merchant=${req.user.merchant_id} → found=${categories.length}`);

                if (categories.length === 0) {
                    failCount++;
                    const error = `Row ${row.rowNumber}: Category ID ${row.category_id} does not exist`;
                    errors.push({ rowNumber: row.rowNumber, error, rowData: row });
                    // Use backticks for column names
                    await promisePool.query(
                        `INSERT INTO product_import_errors (import_id, \`row_number\`, error_message, row_data) VALUES (?, ?, ?, ?)`,
                        [importId, row.rowNumber, error, JSON.stringify(row)]
                    );
                    continue;
                }

                // Check for duplicate SKU or barcode (scoped to merchant)
                if (row.sku && row.sku.trim() !== '') {
                    const [existingSKU] = await promisePool.query(
                        'SELECT id FROM products WHERE sku = ? AND merchant_id = ? AND deleted_at IS NULL',
                        [row.sku.trim(), req.user.merchant_id]
                    );
                    if (existingSKU.length > 0) {
                        failCount++;
                        const error = `Row ${row.rowNumber}: SKU '${row.sku}' already exists`;
                        errors.push({ rowNumber: row.rowNumber, error, rowData: row });
                        await promisePool.query(
                            `INSERT INTO product_import_errors (import_id, \`row_number\`, error_message, row_data) VALUES (?, ?, ?, ?)`,
                            [importId, row.rowNumber, error, JSON.stringify(row)]
                        );
                        continue;
                    }
                }

                if (row.barcode && row.barcode.trim() !== '') {
                    const [existingBarcode] = await promisePool.query(
                        'SELECT id FROM products WHERE barcode = ? AND merchant_id = ? AND deleted_at IS NULL',
                        [row.barcode.trim(), req.user.merchant_id]
                    );
                    if (existingBarcode.length > 0) {
                        failCount++;
                        const error = `Row ${row.rowNumber}: Barcode '${row.barcode}' already exists`;
                        errors.push({ rowNumber: row.rowNumber, error, rowData: row });
                        await promisePool.query(
                            `INSERT INTO product_import_errors (import_id, \`row_number\`, error_message, row_data) VALUES (?, ?, ?, ?)`,
                            [importId, row.rowNumber, error, JSON.stringify(row)]
                        );
                        continue;
                    }
                }

                // Prepare product data
                const productData = {
                    name: row.name.trim(),
                    slug: row.slug && row.slug.trim() !== '' 
                        ? row.slug.trim() 
                        : row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    sku: row.sku && row.sku.trim() !== '' ? row.sku.trim() : null,
                    barcode: row.barcode && row.barcode.trim() !== '' ? row.barcode.trim() : null,
                    category_id: parseInt(row.category_id),
                    description: row.description && row.description.trim() !== '' ? row.description.trim() : null,
                    price: parseFloat(row.price),
                    cost_price: row.cost_price && row.cost_price.trim() !== '' ? parseFloat(row.cost_price) : null,
                    stock_quantity: row.stock_quantity && row.stock_quantity.trim() !== '' ? parseInt(row.stock_quantity) : 0,
                    low_stock_threshold: row.low_stock_threshold && row.low_stock_threshold.trim() !== '' ? parseInt(row.low_stock_threshold) : 10,
                    image_emoji: row.image_emoji && row.image_emoji.trim() !== '' ? row.image_emoji.trim() : '📦',
                    image_url: row.image_url && row.image_url.trim() !== '' ? row.image_url.trim() : null,
                    is_active: row.is_active && row.is_active.trim() !== '' ? parseInt(row.is_active) : 1,
                    created_by: req.user.id,
                };

                // Insert product (with merchant_id)
                await promisePool.query(
                    `INSERT INTO products (
                        name, slug, sku, barcode, category_id, description,
                        price, cost_price, stock_quantity, low_stock_threshold,
                        image_emoji, image_url, is_active, created_by, merchant_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        productData.name,
                        productData.slug,
                        productData.sku,
                        productData.barcode,
                        productData.category_id,
                        productData.description,
                        productData.price,
                        productData.cost_price,
                        productData.stock_quantity,
                        productData.low_stock_threshold,
                        productData.image_emoji,
                        productData.image_url,  // null if not provided
                        productData.is_active,
                        productData.created_by,
                        req.user.merchant_id,
                    ]
                );

                log.info(`[IMPORT] Row ${row.rowNumber}: ✅ inserted successfully`);
                successCount++;
            } catch (error) {
                failCount++;
                const errorMsg = `Row ${row.rowNumber}: ${error.message}`;
                errors.push({ rowNumber: row.rowNumber, error: errorMsg, rowData: row });
                log.error(`[IMPORT] Row ${row.rowNumber}: ❌ DB error → ${error.message}`);
                // Use backticks for column names
                await promisePool.query(
                    `INSERT INTO product_import_errors (import_id, \`row_number\`, error_message, row_data) VALUES (?, ?, ?, ?)`,
                    [importId, row.rowNumber, errorMsg, JSON.stringify(row)]
                );
            }
        }

        // Update import record
        await promisePool.query(
            `UPDATE product_imports SET 
                successful_rows = ?, 
                failed_rows = ?, 
                status = 'completed',
                completed_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [successCount, failCount, importId]
        );

        // Delete uploaded file
        await fs.unlink(filePath);

        log.info(`[IMPORT] ✅ Done: ${successCount} success, ${failCount} failed out of ${results.length} rows`);

        const result = {
            importId,
            totalRows: results.length,
            successfulRows: successCount,
            failedRows: failCount,
            errors: errors.slice(0, 100), // Limit errors in response
        };

        sendSuccess(res, result, 'Product import completed', 200);

    } catch (error) {
        log.error('Product import error:', error);

        // Update import record as failed
        if (importId) {
            await promisePool.query(
                `UPDATE product_imports SET status = 'failed', error_log = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [error.message, importId]
            );
        }

        // Delete uploaded file
        if (filePath) {
            try {
                await fs.unlink(filePath);
            } catch (unlinkError) {
                log.error('Error deleting file:', unlinkError);
            }
        }

        sendError(res, 'Failed to import products', 500);
    }
};

// Get import history
const getImportHistory = async (req, res) => {
    try {
        const [imports] = await promisePool.query(
            `SELECT
                pi.*,
                u.full_name as created_by_name
            FROM product_imports pi
            LEFT JOIN users u ON pi.created_by = u.id
            WHERE u.merchant_id = ?
            ORDER BY pi.created_at DESC
            LIMIT 50`,
            [req.user.merchant_id]
        );

        sendSuccess(res, imports, 'Import history retrieved successfully');
    } catch (error) {
        log.error('Get import history error:', error);
        sendError(res, 'Failed to retrieve import history', 500);
    }
};

// Get import details with errors
const getImportDetails = async (req, res) => {
    try {
        const { id } = req.params;

        // Get import record
        const [imports] = await promisePool.query(
            `SELECT 
                pi.*,
                u.full_name as created_by_name
            FROM product_imports pi
            LEFT JOIN users u ON pi.created_by = u.id
            WHERE pi.id = ?`,
            [id]
        );

        if (imports.length === 0) {
            return sendError(res, 'Import record not found', 404);
        }

        // Get errors - Use backticks for row_number
        const [errors] = await promisePool.query(
            `SELECT * FROM product_import_errors WHERE import_id = ? ORDER BY \`row_number\``,
            [id]
        );

        const result = {
            ...imports[0],
            errors: errors.map(err => ({
                ...err,
                row_data: JSON.parse(err.row_data),
            })),
        };

        sendSuccess(res, result, 'Import details retrieved successfully');
    } catch (error) {
        log.error('Get import details error:', error);
        sendError(res, 'Failed to retrieve import details', 500);
    }
};

// Download CSV template
const downloadTemplate = async (req, res) => {
    try {
        const csvContent = `name,slug,sku,barcode,category_id,description,price,cost_price,stock_quantity,low_stock_threshold,image_emoji,image_url,is_active
"Burger","burger","SKU001","1234567890",1,"Delicious beef burger",8.99,5.00,100,10,"🍔","",1
"Pizza Margherita","pizza-margherita","SKU002","0987654321",1,"Classic Italian pizza",12.99,7.00,50,5,"🍕","",1
"Iced Coffee","iced-coffee","SKU003","1122334455",2,"Refreshing cold coffee",3.99,1.50,200,20,"☕","",1
"Caesar Salad","caesar-salad","SKU004","2233445566",3,"Fresh romaine with caesar dressing",7.99,4.00,30,5,"🥗","",1
"French Fries","french-fries","SKU005","3344556677",4,"Crispy golden fries",2.99,1.00,150,15,"🍟","",1`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=product_import_template.csv');
        res.send(csvContent);
    } catch (error) {
        log.error('Download template error:', error);
        sendError(res, 'Failed to download template', 500);
    }
};

module.exports = {
    importProducts,
    getImportHistory,
    getImportDetails,
    downloadTemplate,
};