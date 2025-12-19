const axios = require('axios');

const API_URL = 'http://localhost:5000/api/v1';
const token = 'YOUR_AUTH_TOKEN_HERE'; // Get from login

async function testProductUpdate() {
    try {
        // 1. Create a product
        console.log('1. Creating product...');
        const createResponse = await axios.post(
            `${API_URL}/products`,
            {
                category_id: 1,
                name: 'Test Product',
                slug: 'test-product-' + Date.now(),
                price: 10.99,
                stock_quantity: 100,
                image_emoji: '🍕',
                image_url: null
            },
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        const productId = createResponse.data.data.id;
        console.log('✅ Product created:', productId);
        console.log('Image URL:', createResponse.data.data.image_url);

        // 2. Update with image
        console.log('\n2. Updating product with image...');
        const updateResponse = await axios.put(
            `${API_URL}/products/${productId}`,
            {
                image_url: '/uploads/products/test-image.jpg'
            },
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        console.log('✅ Product updated');
        console.log('Image URL:', updateResponse.data.data.image_url);

        // 3. Get product to verify
        console.log('\n3. Fetching product...');
        const getResponse = await axios.get(
            `${API_URL}/products/${productId}`,
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        console.log('✅ Product retrieved');
        console.log('Image URL:', getResponse.data.data.image_url);

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

testProductUpdate();