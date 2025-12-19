export const API_CONFIG = {
    // Base URL for API requests
    BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:5000',

    // API endpoints
    API_PREFIX: '/api/v1',

    // Upload paths
    UPLOADS_PATH: '/uploads',
    PRODUCTS_UPLOADS_PATH: '/uploads/products',
    CATEGORIES_UPLOADS_PATH: '/uploads/categories',

    // Helper function to get full image URL
    getImageUrl: (imagePath) => {
        if (!imagePath) return null;
        // If already a full URL, return as is
        if (imagePath.startsWith('http')) return imagePath;
        // Otherwise, prepend base URL
        return `${API_CONFIG.BASE_URL}${imagePath}`;
    },

    // Helper to get API endpoint URL
    getEndpoint: (path) => {
        return `${API_CONFIG.BASE_URL}${API_CONFIG.API_PREFIX}${path}`;
    }
};

export default API_CONFIG;