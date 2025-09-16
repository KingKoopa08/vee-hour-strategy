// Test Admin Panel Functionality
const axios = require('axios');

const BASE_URL = 'http://localhost:3018';

async function testAdminPanel() {
    console.log('🧪 Testing Admin Panel Functionality\n');
    
    // Test 1: Get current settings
    console.log('1️⃣ Testing GET /api/admin/settings...');
    try {
        const response = await axios.get(`${BASE_URL}/api/admin/settings`);
        console.log('✅ Settings retrieved:', JSON.stringify(response.data.settings.webhooks, null, 2));
    } catch (error) {
        console.error('❌ Failed:', error.message);
    }
    
    // Test 2: Save webhooks
    console.log('\n2️⃣ Testing POST /api/admin/webhooks...');
    const testWebhooks = {
        webhooks: {
            rocket: 'https://discord.com/api/webhooks/123456789/abcdefghijk',
            news: 'https://discord.com/api/webhooks/987654321/zyxwvutsrqp',
            urgent: 'https://discord.com/api/webhooks/555555555/mnopqrstuv'
        }
    };
    
    try {
        const response = await axios.post(`${BASE_URL}/api/admin/webhooks`, testWebhooks);
        console.log('✅ Webhooks saved:', response.data.message);
    } catch (error) {
        console.error('❌ Failed:', error.message);
    }
    
    // Test 3: Update thresholds
    console.log('\n3️⃣ Testing POST /api/admin/thresholds...');
    const testThresholds = {
        thresholds: {
            l1: { price: 5, volume: 100000 },
            l2: { price: 15, volume: 250000 },
            l3: { price: 30, volume: 750000 },
            l4: { price: 75, volume: 2500000 }
        }
    };
    
    try {
        const response = await axios.post(`${BASE_URL}/api/admin/thresholds`, testThresholds);
        console.log('✅ Thresholds saved:', response.data.message);
    } catch (error) {
        console.error('❌ Failed:', error.message);
    }
    
    // Test 4: Update general settings
    console.log('\n4️⃣ Testing POST /api/admin/settings...');
    const testSettings = {
        settings: {
            scanInterval: 60,
            volumeMultiplier: 10,
            newsEnabled: true,
            premarketEnabled: true
        }
    };
    
    try {
        const response = await axios.post(`${BASE_URL}/api/admin/settings`, testSettings);
        console.log('✅ Settings updated:', response.data.message);
    } catch (error) {
        console.error('❌ Failed:', error.message);
    }
    
    // Test 5: Get stats
    console.log('\n5️⃣ Testing GET /api/admin/stats...');
    try {
        const response = await axios.get(`${BASE_URL}/api/admin/stats`);
        console.log('✅ Stats retrieved:', response.data.stats);
    } catch (error) {
        console.error('❌ Failed:', error.message);
    }
    
    // Test 6: Verify settings persist
    console.log('\n6️⃣ Verifying settings persisted...');
    try {
        const response = await axios.get(`${BASE_URL}/api/admin/settings`);
        console.log('✅ Final settings:', JSON.stringify(response.data.settings, null, 2));
    } catch (error) {
        console.error('❌ Failed:', error.message);
    }
}

// Run tests
testAdminPanel().then(() => {
    console.log('\n✨ Admin panel tests complete!');
}).catch(error => {
    console.error('Test suite failed:', error);
});