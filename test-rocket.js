// Test rocket scanner with lower thresholds
const axios = require('axios');

async function testRocketScanner() {
    console.log('🚀 Testing Rocket Scanner with current market data...\n');
    
    try {
        // Get top volume stocks
        const response = await axios.get('http://localhost:3018/api/stocks/top-volume');
        const stocks = response.data.stocks;
        
        console.log('Potential Rockets Detected:\n');
        console.log('Level | Symbol | Price  | Change | Volume     | Signal');
        console.log('------|--------|--------|--------|------------|--------');
        
        stocks.forEach(stock => {
            const change = Math.abs(stock.priceChangePercent || 0);
            const volume = stock.volume || 0;
            
            let level = 0;
            let signal = '';
            
            // Adjusted thresholds for testing
            if (change >= 100 && volume >= 100000000) {
                level = 4;
                signal = '🚀 JACKPOT!';
            } else if (change >= 50 && volume >= 50000000) {
                level = 3;
                signal = '🔥 URGENT';
            } else if (change >= 15 && volume >= 10000000) {
                level = 2;
                signal = '⚡ ALERT';
            } else if (change >= 5 && volume >= 5000000) {
                level = 1;
                signal = '👀 WATCH';
            }
            
            if (level > 0) {
                console.log(
                    `L${level}    | ${stock.symbol.padEnd(6)} | $${(stock.price || 0).toFixed(2).padEnd(5)} | ${change.toFixed(1).padStart(5)}% | ${volume.toLocaleString().padEnd(10)} | ${signal}`
                );
            }
        });
        
        // Test news endpoint
        console.log('\n📰 Testing News Feed:\n');
        const newsResponse = await axios.get('http://localhost:3018/api/news/breaking');
        const news = newsResponse.data.news || [];
        
        console.log(`Found ${news.length} news items`);
        news.slice(0, 3).forEach(item => {
            console.log(`- ${item.symbol || 'N/A'}: ${item.headline}`);
        });
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testRocketScanner();