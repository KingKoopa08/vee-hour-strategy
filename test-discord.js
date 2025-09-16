// Discord Webhook Tester
const axios = require('axios');

// REPLACE THIS WITH YOUR WEBHOOK URL
const WEBHOOK_URL = 'YOUR_DISCORD_WEBHOOK_URL_HERE';

async function sendRocketAlert(data) {
    if (!WEBHOOK_URL || WEBHOOK_URL === 'YOUR_DISCORD_WEBHOOK_URL_HERE') {
        console.log('❌ Please set your Discord webhook URL first!');
        console.log('Edit this file and replace YOUR_DISCORD_WEBHOOK_URL_HERE with your actual webhook');
        return;
    }
    
    const color = data.level === 4 ? 0xFF0000 : // Red for JACKPOT
                  data.level === 3 ? 0xFF6432 : // Orange for URGENT
                  data.level === 2 ? 0xFFC832 : // Yellow for ALERT
                  0x6464FF; // Blue for WATCH
    
    const levelEmoji = data.level === 4 ? '🚀 JACKPOT' :
                       data.level === 3 ? '🔥 URGENT' :
                       data.level === 2 ? '⚡ ALERT' :
                       '👀 WATCH';
    
    const alert = {
        embeds: [{
            title: `${levelEmoji}: ${data.symbol}`,
            description: data.news || 'No news catalyst detected',
            color: color,
            fields: [
                { name: 'Price', value: `$${data.price}`, inline: true },
                { name: 'Change', value: `${data.change > 0 ? '+' : ''}${data.change}%`, inline: true },
                { name: 'Volume', value: data.volume, inline: true },
                { name: 'VWAP', value: `$${data.vwap}`, inline: true },
                { name: 'RSI', value: data.rsi.toString(), inline: true },
                { name: 'Float', value: data.float || 'Unknown', inline: true }
            ],
            footer: {
                text: 'Rocket Scanner Alert • Set stops and manage risk!'
            },
            timestamp: new Date().toISOString()
        }]
    };
    
    try {
        const response = await axios.post(WEBHOOK_URL, alert);
        console.log(`✅ Alert sent for ${data.symbol}!`);
    } catch (error) {
        console.error('❌ Discord webhook error:', error.message);
    }
}

// Test with real data from today
async function testWithRealData() {
    console.log('🚀 Testing Discord alerts with real rocket data...\n');
    
    // These are actual movers from today
    const testRockets = [
        {
            symbol: 'CHEK',
            price: 2.47,
            change: 231.2,
            volume: '129.6M',
            vwap: 2.15,
            rsi: 89.5,
            level: 4,
            news: 'Check-Cap announces definitive merger agreement with MBody AI',
            float: '10M'
        },
        {
            symbol: 'ATCH',
            price: 0.99,
            change: 153.8,
            volume: '498M',
            vwap: 0.85,
            rsi: 78.2,
            level: 4,
            news: 'AtlasClear announces strategic partnership',
            float: '25M'
        },
        {
            symbol: 'ATYR',
            price: 1.08,
            change: 82.1,
            volume: '155M',
            vwap: 0.95,
            rsi: 71.3,
            level: 3,
            news: 'aTyr Pharma reports positive clinical trial results',
            float: '50M'
        }
    ];
    
    // Send test alerts with 2-second delay between each
    for (const rocket of testRockets) {
        await sendRocketAlert(rocket);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n✨ Test complete! Check your Discord channel for alerts.');
}

// Run the test
testWithRealData();