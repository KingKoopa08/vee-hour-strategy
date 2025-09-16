// Test Rocket Scanner with Live Market Data
const axios = require('axios');

const BASE_URL = 'http://localhost:3018';

// Color codes for terminal output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

async function testRocketScanner() {
    console.log(`${colors.cyan}🚀 ROCKET SCANNER - LIVE MARKET TEST${colors.reset}\n`);
    console.log(`Time: ${new Date().toLocaleString()}\n`);
    
    try {
        // 1. Get current top volume stocks
        console.log(`${colors.yellow}📊 Fetching top volume stocks...${colors.reset}`);
        const volumeResponse = await axios.get(`${BASE_URL}/api/stocks/top-volume`);
        const stocks = volumeResponse.data.stocks || [];
        
        console.log(`Found ${stocks.length} active stocks\n`);
        
        // 2. Analyze for potential rockets
        console.log(`${colors.yellow}🔍 Analyzing for rocket patterns...${colors.reset}\n`);
        
        const rockets = [];
        const watchlist = [];
        
        // Get current settings
        const settingsResponse = await axios.get(`${BASE_URL}/api/admin/settings`);
        const thresholds = settingsResponse.data.settings.thresholds;
        
        stocks.forEach(stock => {
            const change = Math.abs(stock.priceChangePercent || 0);
            const volume = stock.volume || 0;
            const price = stock.price || 0;
            
            // Apply threshold logic
            let level = 0;
            let signal = '';
            let color = colors.reset;
            
            if (change >= thresholds.l4.price && volume >= thresholds.l4.volume) {
                level = 4;
                signal = '🚀 JACKPOT!';
                color = colors.red;
            } else if (change >= thresholds.l3.price && volume >= thresholds.l3.volume) {
                level = 3;
                signal = '🔥 URGENT';
                color = colors.magenta;
            } else if (change >= thresholds.l2.price && volume >= thresholds.l2.volume) {
                level = 2;
                signal = '⚡ ALERT';
                color = colors.yellow;
            } else if (change >= thresholds.l1.price && volume >= thresholds.l1.volume) {
                level = 1;
                signal = '👀 WATCH';
                color = colors.cyan;
            }
            
            if (level > 0) {
                const rocket = {
                    symbol: stock.symbol,
                    price: price,
                    change: stock.priceChangePercent,
                    volume: volume,
                    level: level,
                    signal: signal,
                    color: color,
                    vwap: stock.vwap || price,
                    high: stock.high,
                    low: stock.low
                };
                
                if (level >= 2) {
                    rockets.push(rocket);
                } else {
                    watchlist.push(rocket);
                }
            }
        });
        
        // 3. Display rockets
        if (rockets.length > 0) {
            console.log(`${colors.red}🎯 ROCKETS DETECTED (Level 2+):${colors.reset}\n`);
            console.log('Symbol  | Price   | Change  | Volume      | Signal');
            console.log('--------|---------|---------|-------------|----------------');
            
            rockets.sort((a, b) => b.level - a.level || Math.abs(b.change) - Math.abs(a.change));
            
            rockets.forEach(r => {
                const changeStr = r.change > 0 ? `+${r.change.toFixed(1)}%` : `${r.change.toFixed(1)}%`;
                const volStr = r.volume >= 1000000 ? 
                    `${(r.volume / 1000000).toFixed(1)}M` : 
                    `${(r.volume / 1000).toFixed(0)}K`;
                
                console.log(
                    `${r.color}${r.symbol.padEnd(7)} | ` +
                    `$${r.price.toFixed(2).padEnd(6)} | ` +
                    `${changeStr.padEnd(7)} | ` +
                    `${volStr.padEnd(11)} | ` +
                    `${r.signal}${colors.reset}`
                );
            });
        }
        
        // 4. Display watchlist
        if (watchlist.length > 0) {
            console.log(`\n${colors.cyan}👀 WATCHLIST (Level 1):${colors.reset}\n`);
            watchlist.slice(0, 10).forEach(w => {
                const changeStr = w.change > 0 ? `+${w.change.toFixed(1)}%` : `${w.change.toFixed(1)}%`;
                console.log(`${w.color}${w.symbol}: ${changeStr} on ${(w.volume/1000000).toFixed(1)}M volume${colors.reset}`);
            });
        }
        
        // 5. Test news endpoint
        console.log(`\n${colors.yellow}📰 Checking for news catalysts...${colors.reset}`);
        try {
            const newsResponse = await axios.get(`${BASE_URL}/api/news/breaking`);
            const news = newsResponse.data.news || [];
            
            if (news.length > 0) {
                console.log(`Found ${news.length} news items\n`);
                news.slice(0, 5).forEach(item => {
                    if (item.symbol && rockets.some(r => r.symbol === item.symbol)) {
                        console.log(`${colors.green}📰 [${item.symbol}] ${item.headline}${colors.reset}`);
                    } else {
                        console.log(`📰 [${item.symbol || 'MARKET'}] ${item.headline}`);
                    }
                });
            }
        } catch (error) {
            console.log('No news data available');
        }
        
        // 6. Send test Discord alert for top rocket
        if (rockets.length > 0) {
            const topRocket = rockets[0];
            console.log(`\n${colors.yellow}📤 Sending Discord alert for ${topRocket.symbol}...${colors.reset}`);
            
            try {
                const alertData = {
                    symbol: topRocket.symbol,
                    price: topRocket.price,
                    change: topRocket.change,
                    volume: topRocket.volume,
                    vwap: topRocket.vwap,
                    rsi: 75 + Math.random() * 20, // Simulate RSI
                    level: topRocket.level,
                    news: 'Testing rocket detection system',
                    float: 'Unknown'
                };
                
                // Test via the rocket scan endpoint
                const scanResponse = await axios.post(`${BASE_URL}/api/rockets/scan`, {
                    testMode: true,
                    testData: alertData
                });
                
                if (scanResponse.data.success) {
                    console.log(`${colors.green}✅ Alert would be sent (check Discord if webhooks configured)${colors.reset}`);
                }
            } catch (error) {
                console.log('Discord alert test skipped (webhooks not configured)');
            }
        }
        
        // 7. Summary statistics
        console.log(`\n${colors.cyan}📈 SUMMARY STATISTICS:${colors.reset}`);
        console.log(`Total stocks analyzed: ${stocks.length}`);
        console.log(`Rockets detected (L2+): ${rockets.length}`);
        console.log(`Watchlist stocks (L1): ${watchlist.length}`);
        console.log(`Current thresholds:`);
        console.log(`  L1: ${thresholds.l1.price}% gain, ${(thresholds.l1.volume/1000000).toFixed(1)}M volume`);
        console.log(`  L2: ${thresholds.l2.price}% gain, ${(thresholds.l2.volume/1000000).toFixed(1)}M volume`);
        console.log(`  L3: ${thresholds.l3.price}% gain, ${(thresholds.l3.volume/1000000).toFixed(1)}M volume`);
        console.log(`  L4: ${thresholds.l4.price}% gain, ${(thresholds.l4.volume/1000000).toFixed(1)}M volume`);
        
        // 8. Market status
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const day = now.getDay();
        
        let marketStatus = '';
        if (day === 0 || day === 6) {
            marketStatus = 'Weekend - Markets Closed';
        } else if (hour < 4) {
            marketStatus = 'Pre-Market Closed';
        } else if (hour >= 4 && hour < 9) {
            marketStatus = '🌅 PRE-MARKET ACTIVE';
        } else if (hour === 9 && minute < 30) {
            marketStatus = '🌅 PRE-MARKET ACTIVE';
        } else if ((hour === 9 && minute >= 30) || (hour > 9 && hour < 16)) {
            marketStatus = '🔔 REGULAR HOURS';
        } else if (hour >= 16 && hour < 20) {
            marketStatus = '🌙 AFTER-HOURS ACTIVE';
        } else {
            marketStatus = 'After-Hours Closed';
        }
        
        console.log(`\nMarket Status: ${marketStatus}`);
        
    } catch (error) {
        console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    }
}

// Run test and repeat every 30 seconds if requested
async function runContinuous() {
    const args = process.argv.slice(2);
    const continuous = args.includes('--continuous') || args.includes('-c');
    
    if (continuous) {
        console.log(`${colors.green}Running in continuous mode (30s intervals). Press Ctrl+C to stop.${colors.reset}\n`);
        
        while (true) {
            await testRocketScanner();
            console.log(`\n${colors.yellow}Waiting 30 seconds for next scan...${colors.reset}\n`);
            console.log('='.repeat(60) + '\n');
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    } else {
        await testRocketScanner();
        console.log(`\n${colors.cyan}Run with --continuous flag to repeat every 30 seconds${colors.reset}`);
    }
}

// Start the test
runContinuous().catch(console.error);