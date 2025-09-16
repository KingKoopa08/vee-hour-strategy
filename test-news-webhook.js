const axios = require('axios');

// Your news webhook
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1417344241545248768/AUwRtrVgSME5Ry_vu6nOVRhPe0yN4duKnl_8beFXuLFoM0CReBZv1iANIs_rkoydOKQQ';

async function testNewsWebhook() {
    const testEmbed = {
        embeds: [{
            title: '📰 TEST: Breaking Market News',
            description: 'This is a test news alert to verify the webhook is working correctly.',
            url: 'https://example.com',
            color: 0x0099FF,
            fields: [
                {
                    name: 'Symbols',
                    value: 'SPY, QQQ, AAPL',
                    inline: true
                },
                {
                    name: 'Publisher',
                    value: 'Test Publisher',
                    inline: true
                },
                {
                    name: 'Impact',
                    value: 'High',
                    inline: true
                }
            ],
            footer: {
                text: 'Rocket Scanner News Alert - TEST'
            },
            timestamp: new Date().toISOString()
        }]
    };
    
    try {
        const response = await axios.post(WEBHOOK_URL, testEmbed);
        console.log('✅ News webhook test successful!');
        console.log('Response status:', response.status);
        console.log('Check your Discord channel for the test message.');
    } catch (error) {
        console.error('❌ News webhook test failed!');
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}

testNewsWebhook();