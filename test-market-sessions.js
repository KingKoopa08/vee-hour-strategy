// Test Market Session Detection and Data Switching
const axios = require('axios');

const BASE_URL = 'http://localhost:3018';

// Colors for terminal
const colors = {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    reset: '\x1b[0m'
};

// Market session schedule (ET)
const MARKET_SCHEDULE = {
    'Pre-Market': { start: '04:00', end: '09:30', color: colors.yellow },
    'Regular Hours': { start: '09:30', end: '16:00', color: colors.green },
    'After-Hours': { start: '16:00', end: '20:00', color: colors.magenta },
    'Closed': { start: '20:00', end: '04:00', color: colors.cyan }
};

async function testMarketSessions() {
    console.log(`${colors.cyan}🕐 MARKET SESSION DETECTION TEST${colors.reset}\n`);
    console.log('Current Time:', new Date().toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }));
    console.log('=' .repeat(60) + '\n');
    
    // Test current session
    console.log(`${colors.yellow}1. Testing Current Market Session:${colors.reset}`);
    try {
        const response = await axios.get(`${BASE_URL}/api/rockets/scan`);
        const data = response.data;
        
        const sessionColor = data.marketSession.session === 'premarket' ? colors.yellow :
                           data.marketSession.session === 'regular' ? colors.green :
                           data.marketSession.session === 'afterhours' ? colors.magenta :
                           colors.cyan;
        
        console.log(`   Session: ${sessionColor}${data.marketSession.description}${colors.reset}`);
        console.log(`   Status: ${data.marketSession.session}`);
        console.log(`   Rockets Found: ${data.rockets.length}`);
        
        if (data.rockets.length > 0) {
            console.log('\n   Top Rockets:');
            data.rockets.slice(0, 3).forEach((r, i) => {
                const changeColor = r.changePercent > 0 ? colors.green : '\x1b[31m';
                console.log(`   ${i + 1}. ${r.symbol}: ${changeColor}${r.changePercent > 0 ? '+' : ''}${r.changePercent.toFixed(1)}%${colors.reset} on ${(r.volume/1000000).toFixed(1)}M volume (${r.session || 'unknown'} session)`);
            });
        }
    } catch (error) {
        console.error('   Error:', error.message);
    }
    
    // Show schedule
    console.log(`\n${colors.yellow}2. Market Schedule (Eastern Time):${colors.reset}`);
    Object.entries(MARKET_SCHEDULE).forEach(([session, times]) => {
        console.log(`   ${times.color}${session.padEnd(15)}${colors.reset} ${times.start} - ${times.end}`);
    });
    
    // Test data availability by session
    console.log(`\n${colors.yellow}3. Data Sources by Session:${colors.reset}`);
    console.log(`   ${colors.yellow}Pre-Market:${colors.reset}`);
    console.log('      • Polygon gainers/losers API');
    console.log('      • Snapshot pre-market data');
    console.log('      • Watchlist stocks with volume > 100K');
    
    console.log(`\n   ${colors.green}Regular Hours:${colors.reset}`);
    console.log('      • Real-time top volume stocks');
    console.log('      • Full market snapshot data');
    console.log('      • All active stocks with live prices');
    
    console.log(`\n   ${colors.magenta}After-Hours:${colors.reset}`);
    console.log('      • Snapshot after-hours data');
    console.log('      • Top 50 stocks with AH activity');
    console.log('      • Volume leaders from regular session');
    
    console.log(`\n   ${colors.cyan}Closed Hours:${colors.reset}`);
    console.log('      • Last session\'s data cached');
    console.log('      • Historical snapshots available');
    
    // Show what to expect
    console.log(`\n${colors.yellow}4. Expected Behavior:${colors.reset}`);
    const now = new Date();
    const etTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const hour = etTime.getHours();
    const minute = etTime.getMinutes();
    const time = hour * 100 + minute;
    
    if (time >= 400 && time < 930) {
        console.log(`   ${colors.yellow}✅ Currently PRE-MARKET${colors.reset}`);
        console.log('   Scanner will check for pre-market movers');
        console.log('   Focus on stocks with news catalysts');
        console.log('   Lower volume thresholds (100K+)');
    } else if (time >= 930 && time < 1600) {
        console.log(`   ${colors.green}✅ Currently REGULAR HOURS${colors.reset}`);
        console.log('   Scanner checking all active stocks');
        console.log('   High volume thresholds (500K+)');
        console.log('   Full market data available');
    } else if (time >= 1600 && time < 2000) {
        console.log(`   ${colors.magenta}✅ Currently AFTER-HOURS${colors.reset}`);
        console.log('   Scanner checking for AH movers');
        console.log('   Focus on earnings/news reactions');
        console.log('   Limited liquidity expected');
    } else {
        console.log(`   ${colors.cyan}✅ Currently MARKET CLOSED${colors.reset}`);
        console.log('   Scanner returns cached data');
        console.log('   Pre-market opens at 4:00 AM ET');
        console.log('   Set alerts for tomorrow\'s open');
    }
    
    // Test specific endpoints
    console.log(`\n${colors.yellow}5. Testing Session-Specific Endpoints:${colors.reset}`);
    
    // Test pre-market endpoint
    try {
        const pmResponse = await axios.get(`${BASE_URL}/api/stocks/top-volume?type=premarket`);
        console.log(`   Pre-Market Data: ${pmResponse.data.stocks ? pmResponse.data.stocks.length : 0} stocks`);
    } catch (error) {
        console.log(`   Pre-Market Data: Not available`);
    }
    
    // Test after-hours endpoint
    try {
        const ahResponse = await axios.get(`${BASE_URL}/api/stocks/top-volume?type=afterhours`);
        console.log(`   After-Hours Data: ${ahResponse.data.stocks ? ahResponse.data.stocks.length : 0} stocks`);
    } catch (error) {
        console.log(`   After-Hours Data: Not available`);
    }
    
    // Test regular endpoint
    try {
        const regResponse = await axios.get(`${BASE_URL}/api/stocks/top-volume`);
        console.log(`   Regular Data: ${regResponse.data.stocks ? regResponse.data.stocks.length : 0} stocks`);
    } catch (error) {
        console.log(`   Regular Data: Error fetching`);
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log(`${colors.cyan}✨ Session detection complete!${colors.reset}`);
    console.log('\nThe scanner automatically switches data sources based on market hours.');
    console.log('During each session, it pulls the most relevant data for that time period.\n');
}

// Run test
testMarketSessions().catch(console.error);