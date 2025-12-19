const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const { verifyToken, checkRole } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

// All report routes require authentication
router.use(verifyToken);

// Get daily sales report
router.get('/sales/daily', reportsController.getDailySalesReport);

// Get sales report by date range
router.get('/sales/range', reportsController.getSalesReportByRange);

// Get top selling products
router.get('/products/top-selling', reportsController.getTopSellingProducts);

// Get sales by payment method
router.get('/sales/payment-method', reportsController.getSalesByPaymentMethod);

// Get hourly sales
router.get('/sales/hourly', reportsController.getHourlySales);

// Get low stock products
router.get('/products/low-stock', reportsController.getLowStockProducts);

// Get product sales statistics
router.get('/products/:product_id/stats', reportsController.getProductSalesStats);

// All report routes require authentication
router.use(verifyToken);

// Sales summary
router.get('/sales-summary', reportsController.getSalesSummary);

// Sales by period
router.get('/sales-by-period', reportsController.getSalesByPeriod);

// Top products
router.get('/top-products', reportsController.getTopProducts);

// Sales by category
router.get('/sales-by-category', reportsController.getSalesByCategory);

// Recent orders
router.get('/recent-orders', reportsController.getRecentOrders);

// Export report
router.get('/export', reportsController.exportReport);


module.exports = router;