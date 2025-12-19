const { promisePool } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/response');
const log = require('../utils/logger');

// Get daily sales report
const getDailySalesReport = async (req, res) => {
    try {
        const { date } = req.query;
        const reportDate = date || new Date().toISOString().split('T')[0];

        const [report] = await promisePool.query(
            `SELECT 
                DATE(created_at) as date,
                COUNT(*) as total_orders,
                SUM(total) as total_sales,
                SUM(tax_amount) as total_tax,
                SUM(discount_amount) as total_discounts,
                AVG(total) as average_order_value,
                SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END) as cash_sales,
                SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END) as card_sales,
                SUM(CASE WHEN payment_method = 'mobile' THEN total ELSE 0 END) as mobile_sales,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
                COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders
             FROM orders
             WHERE DATE(created_at) = ?
               AND deleted_at IS NULL`,
            [reportDate]
        );

        sendSuccess(res, report[0] || {}, 'Daily sales report retrieved successfully');

    } catch (error) {
        log.error('Get daily sales report error:', error);
        sendError(res, 'Failed to retrieve daily sales report', 500);
    }
};

// Get sales report by date range
const getSalesReportByRange = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return sendError(res, 'Start date and end date are required', 400);
        }

        const [report] = await promisePool.query(
            `SELECT 
                DATE(created_at) as date,
                COUNT(*) as total_orders,
                SUM(total) as total_sales,
                SUM(tax_amount) as total_tax,
                AVG(total) as average_order_value
             FROM orders
             WHERE DATE(created_at) BETWEEN ? AND ?
               AND status = 'completed'
               AND deleted_at IS NULL
             GROUP BY DATE(created_at)
             ORDER BY DATE(created_at) ASC`,
            [start_date, end_date]
        );

        sendSuccess(res, report, 'Sales report retrieved successfully');

    } catch (error) {
        log.error('Get sales report by range error:', error);
        sendError(res, 'Failed to retrieve sales report', 500);
    }
};

// Get top selling products
const getTopSellingProducts = async (req, res) => {
    try {
        const { start_date, end_date, limit = 10 } = req.query;

        let query = `
            SELECT 
                p.id,
                p.name,
                p.image_emoji,
                c.name as category_name,
                SUM(oi.quantity) as total_sold,
                SUM(oi.total) as total_revenue,
                COUNT(DISTINCT o.id) as order_count
            FROM order_items oi
            INNER JOIN orders o ON oi.order_id = o.id
            INNER JOIN products p ON oi.product_id = p.id
            INNER JOIN categories c ON p.category_id = c.id
            WHERE o.status = 'completed'
              AND o.deleted_at IS NULL
        `;
        const params = [];

        if (start_date && end_date) {
            query += ' AND DATE(o.created_at) BETWEEN ? AND ?';
            params.push(start_date, end_date);
        }

        query += `
            GROUP BY p.id, p.name, p.image_emoji, c.name
            ORDER BY total_revenue DESC
            LIMIT ?
        `;
        params.push(parseInt(limit));

        const [products] = await promisePool.query(query, params);

        sendSuccess(res, products, 'Top selling products retrieved successfully');

    } catch (error) {
        log.error('Get top selling products error:', error);
        sendError(res, 'Failed to retrieve top selling products', 500);
    }
};

// Get sales by payment method
const getSalesByPaymentMethod = async (req, res) => {
    try {
        const { date } = req.query;
        const reportDate = date || new Date().toISOString().split('T')[0];

        const [report] = await promisePool.query(
            `SELECT 
                payment_method,
                COUNT(*) as order_count,
                SUM(total) as total_amount
             FROM orders
             WHERE DATE(created_at) = ?
               AND status = 'completed'
               AND deleted_at IS NULL
             GROUP BY payment_method
             ORDER BY total_amount DESC`,
            [reportDate]
        );

        sendSuccess(res, report, 'Sales by payment method retrieved successfully');

    } catch (error) {
        log.error('Get sales by payment method error:', error);
        sendError(res, 'Failed to retrieve sales by payment method', 500);
    }
};

// Get hourly sales
const getHourlySales = async (req, res) => {
    try {
        const { date } = req.query;
        const reportDate = date || new Date().toISOString().split('T')[0];

        const [report] = await promisePool.query(
            `SELECT 
                HOUR(created_at) as hour,
                COUNT(*) as orders,
                SUM(total) as revenue
             FROM orders
             WHERE DATE(created_at) = ?
               AND status = 'completed'
               AND deleted_at IS NULL
             GROUP BY HOUR(created_at)
             ORDER BY hour ASC`,
            [reportDate]
        );

        sendSuccess(res, report, 'Hourly sales retrieved successfully');

    } catch (error) {
        log.error('Get hourly sales error:', error);
        sendError(res, 'Failed to retrieve hourly sales', 500);
    }
};

// Get low stock products
const getLowStockProducts = async (req, res) => {
    try {
        const [products] = await promisePool.query(
            `SELECT 
                p.id,
                p.name,
                p.stock_quantity,
                p.low_stock_threshold,
                p.price,
                c.name as category_name,
                c.icon as category_icon
             FROM products p
             INNER JOIN categories c ON p.category_id = c.id
             WHERE p.stock_quantity <= p.low_stock_threshold
               AND p.is_active = TRUE
               AND p.deleted_at IS NULL
             ORDER BY p.stock_quantity ASC`
        );

        sendSuccess(res, products, 'Low stock products retrieved successfully');

    } catch (error) {
        log.error('Get low stock products error:', error);
        sendError(res, 'Failed to retrieve low stock products', 500);
    }
};

// Get product sales statistics
const getProductSalesStats = async (req, res) => {
    try {
        const { product_id } = req.params;

        const [stats] = await promisePool.query(
            `SELECT 
                p.id as product_id,
                p.name as product_name,
                p.image_emoji,
                c.name as category_name,
                COUNT(oi.id) as times_ordered,
                SUM(oi.quantity) as total_quantity_sold,
                SUM(oi.total) as total_revenue,
                AVG(oi.unit_price) as average_price,
                MAX(o.created_at) as last_ordered_at
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN order_items oi ON p.id = oi.product_id
             LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'completed' AND o.deleted_at IS NULL
             WHERE p.id = ? AND p.deleted_at IS NULL
             GROUP BY p.id, p.name, p.image_emoji, c.name`,
            [product_id]
        );

        if (stats.length === 0) {
            return sendError(res, 'Product not found', 404);
        }

        sendSuccess(res, stats[0], 'Product sales statistics retrieved successfully');

    } catch (error) {
        log.error('Get product sales stats error:', error);
        sendError(res, 'Failed to retrieve product sales statistics', 500);
    }
};

// Get sales summary with totals
const getSalesSummary = async (req, res) => {
    try {
        log.info('=== GET SALES SUMMARY ===');
        const { period, startDate, endDate } = req.query;

        const dateCondition = getDateCondition(period, startDate, endDate);

        // Get current period stats
        const [currentStats] = await promisePool.query(
            `SELECT 
                COUNT(DISTINCT o.id) as total_receipts,
                COALESCE(SUM(oi.quantity), 0) as total_items,
                COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_cost,
                COALESCE(SUM(o.total), 0) as total_sale,
                COALESCE(SUM(o.total - (oi.quantity * COALESCE(p.cost_price, 0))), 0) as total_profit
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.status = 'completed' 
            AND o.deleted_at IS NULL
            ${dateCondition}`,
        );

        const summary = {
            total_receipts: currentStats[0].total_receipts || 0,
            total_items: currentStats[0].total_items || 0,
            total_cost: parseFloat(currentStats[0].total_cost || 0),
            total_sale: parseFloat(currentStats[0].total_sale || 0),
            total_profit: parseFloat(currentStats[0].total_profit || 0),
        };

        log.success('Sales summary retrieved', summary);
        sendSuccess(res, summary, 'Sales summary retrieved successfully');

    } catch (error) {
        log.error('Get sales summary error', error);
        sendError(res, 'Failed to retrieve sales summary', 500);
    }
};

// Get sales by period (daily breakdown)
const getSalesByPeriod = async (req, res) => {
    try {
        log.info('=== GET SALES BY PERIOD ===');
        const { period, startDate, endDate } = req.query;

        const dateCondition = getDateCondition(period, startDate, endDate);

        const [sales] = await promisePool.query(
            `SELECT 
                DATE(o.created_at) as date,
                COUNT(DISTINCT o.id) as total_orders,
                COALESCE(SUM(oi.quantity), 0) as total_items,
                COALESCE(SUM(o.total), 0) as total_sales,
                COALESCE(AVG(o.total), 0) as average_order
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.status = 'completed' 
            AND o.deleted_at IS NULL
            ${dateCondition}
            GROUP BY DATE(o.created_at)
            ORDER BY date DESC
            LIMIT 30`,
        );

        log.success(`Retrieved ${sales.length} period records`);
        sendSuccess(res, sales, 'Sales by period retrieved successfully');

    } catch (error) {
        log.error('Get sales by period error', error);
        sendError(res, 'Failed to retrieve sales by period', 500);
    }
};

// Get top selling products
const getTopProducts = async (req, res) => {
    try {
        log.info('=== GET TOP PRODUCTS ===');
        const { period, startDate, endDate, limit = 10 } = req.query;

        const dateCondition = getDateCondition(period, startDate, endDate);

        const [products] = await promisePool.query(
            `SELECT 
                p.id as product_id,
                p.name as product_name,
                p.image_emoji,
                COALESCE(SUM(oi.quantity), 0) as total_quantity,
                COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_revenue,
                COALESCE(AVG(oi.unit_price), 0) as average_price
            FROM order_items oi
            INNER JOIN orders o ON oi.order_id = o.id
            INNER JOIN products p ON oi.product_id = p.id
            WHERE o.status = 'completed' 
            AND o.deleted_at IS NULL
            ${dateCondition}
            GROUP BY p.id, p.name, p.image_emoji
            ORDER BY total_quantity DESC
            LIMIT ?`,
            [parseInt(limit)]
        );

        log.success(`Retrieved ${products.length} top products`);
        sendSuccess(res, products, 'Top products retrieved successfully');

    } catch (error) {
        log.error('Get top products error', error);
        sendError(res, 'Failed to retrieve top products', 500);
    }
};

// Get sales by category
const getSalesByCategory = async (req, res) => {
    try {
        log.info('=== GET SALES BY CATEGORY ===');
        const { period, startDate, endDate } = req.query;

        const dateCondition = getDateCondition(period, startDate, endDate);

        const [categories] = await promisePool.query(
            `SELECT 
                c.id as category_id,
                c.name as category_name,
                c.icon as category_icon,
                COUNT(DISTINCT p.id) as product_count,
                COALESCE(SUM(oi.quantity), 0) as total_quantity,
                COALESCE(SUM(oi.quantity * oi.unit_price), 0) as total_revenue,
                (COALESCE(SUM(oi.quantity * oi.unit_price), 0) / 
                    (SELECT SUM(quantity * unit_price) 
                     FROM order_items oi2 
                     INNER JOIN orders o2 ON oi2.order_id = o2.id 
                     WHERE o2.status = 'completed' AND o2.deleted_at IS NULL ${dateCondition}
                    ) * 100
                ) as revenue_percentage
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id
            LEFT JOIN order_items oi ON p.id = oi.product_id
            LEFT JOIN orders o ON oi.order_id = o.id
            WHERE o.status = 'completed' 
            AND o.deleted_at IS NULL
            ${dateCondition}
            GROUP BY c.id, c.name, c.icon
            HAVING total_revenue > 0
            ORDER BY total_revenue DESC`,
        );

        log.success(`Retrieved ${categories.length} category records`);
        sendSuccess(res, categories, 'Sales by category retrieved successfully');

    } catch (error) {
        log.error('Get sales by category error', error);
        sendError(res, 'Failed to retrieve sales by category', 500);
    }
};

// Get recent orders (ticket list)
const getRecentOrders = async (req, res) => {
    try {
        log.info('=== GET RECENT ORDERS ===');
        const { period, startDate, endDate, limit = 50, status } = req.query;

        const dateCondition = getDateCondition(period, startDate, endDate);
        let statusCondition = '';

        if (status && status !== 'all') {
            statusCondition = ` AND o.status = '${status}'`;
        }

        const [orders] = await promisePool.query(
            `SELECT 
                o.id,
                o.order_number as code,
                o.table_id,
                o.status,
                o.payment_method,
                o.subtotal,
                o.tax_amount,
                o.total as grand_total,
                o.created_at as date,
                u.username as seller,
                COALESCE(SUM(oi.quantity), 0) as quantity,
                COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0) as cost,
                (o.total - COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0)) as profit
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.deleted_at IS NULL
            ${dateCondition}
            ${statusCondition}
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT ?`,
            [parseInt(limit)]
        );

        log.success(`Retrieved ${orders.length} recent orders`);
        sendSuccess(res, orders, 'Recent orders retrieved successfully');

    } catch (error) {
        log.error('Get recent orders error', error);
        sendError(res, 'Failed to retrieve recent orders', 500);
    }
};

// Helper function to build date condition
const getDateCondition = (period, startDate, endDate) => {
    let condition = '';

    if (period) {
        switch (period) {
            case 'today':
                condition = ' AND DATE(o.created_at) = CURDATE()';
                break;
            case 'yesterday':
                condition = ' AND DATE(o.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
                break;
            case 'week':
                condition = ' AND YEARWEEK(o.created_at, 1) = YEARWEEK(CURDATE(), 1)';
                break;
            case 'month':
                condition = ' AND YEAR(o.created_at) = YEAR(CURDATE()) AND MONTH(o.created_at) = MONTH(CURDATE())';
                break;
            case 'year':
                condition = ' AND YEAR(o.created_at) = YEAR(CURDATE())';
                break;
        }
    } else if (startDate && endDate) {
        condition = ` AND DATE(o.created_at) BETWEEN '${startDate}' AND '${endDate}'`;
    }

    return condition;
};

// Export report (placeholder - implement with PDF/Excel library)
const exportReport = async (req, res) => {
    try {
        log.info('=== EXPORT REPORT ===');
        const { format = 'pdf' } = req.query;

        // TODO: Implement actual PDF/Excel export
        // For now, return a message
        sendSuccess(res, {
            message: `${format.toUpperCase()} export will be implemented soon`,
            format
        }, 'Export initiated');

    } catch (error) {
        log.error('Export report error', error);
        sendError(res, 'Failed to export report', 500);
    }
};

module.exports = {
    getDailySalesReport,
    getSalesReportByRange,
    getTopSellingProducts,
    getSalesByPaymentMethod,
    getHourlySales,
    getLowStockProducts,
    getProductSalesStats,
    getSalesSummary,
    getSalesByPeriod,
    getTopProducts,
    getSalesByCategory,
    getRecentOrders,
    exportReport,
};