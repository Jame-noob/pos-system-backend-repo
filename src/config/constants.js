module.exports = {
    // User Roles
    ROLES: {
        ADMIN: 'admin',
        MANAGER: 'manager',
        CASHIER: 'cashier'
    },

    // Order Status
    ORDER_STATUS: {
        DRAFT: 'draft',
        PENDING: 'pending',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    },

    // Payment Status
    PAYMENT_STATUS: {
        UNPAID: 'unpaid',
        PAID: 'paid',
        REFUNDED: 'refunded'
    },

    // Payment Methods
    PAYMENT_METHODS: {
        CASH: 'cash',
        CARD: 'card',
        MOBILE: 'mobile',
        OTHER: 'other'
    },

    // Table Status
    TABLE_STATUS: {
        AVAILABLE: 'available',
        OCCUPIED: 'occupied',
        RESERVED: 'reserved',
        MAINTENANCE: 'maintenance'
    },

    // Stock Movement Types
    STOCK_MOVEMENT: {
        IN: 'in',
        OUT: 'out',
        ADJUSTMENT: 'adjustment',
        RETURN: 'return'
    }
};