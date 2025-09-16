#!/usr/bin/env node

/**
 * Test Market Open Behavior
 * Simulates market open transition to test gap detection and ORB features
 */

const axios = require('axios');

const API_URL = 'http://localhost:3018';

async function testMarketOpen() {
    console.log('🔔 Testing Market Open Behavior\n');
    
    try {
        // 1. Check current market session
        console.log('📊 Checking current market session...');
        const scanResponse = await axios.get(`${API_URL}/api/rockets/scan`);
        const { marketSession } = scanResponse.data;
        console.log(`   Session: ${marketSession.session}`);
        console.log(`   Description: ${marketSession.description}\n`);
        
        // 2. Check for gaps in detected rockets
        console.log('🔍 Checking for gap stocks...');
        const rockets = scanResponse.data.rockets || [];
        const gapStocks = rockets.filter(r => r.gap);
        
        if (gapStocks.length > 0) {
            console.log(`   Found ${gapStocks.length} gap stocks:`);
            gapStocks.forEach(stock => {
                console.log(`   - ${stock.symbol}: ${stock.gap.type} ${stock.gap.percent.toFixed(1)}%`);
            });
        } else {
            console.log('   No gap stocks detected (normal if not at market open)');
        }
        console.log('');
        
        // 3. Check for ORB signals
        console.log('🎯 Checking for ORB breakouts...');
        const orbStocks = rockets.filter(r => r.orbSignal);
        
        if (orbStocks.length > 0) {
            console.log(`   Found ${orbStocks.length} ORB signals:`);
            orbStocks.forEach(stock => {
                console.log(`   - ${stock.symbol}: ${stock.orbSignal.type} at $${stock.orbSignal.level.toFixed(2)}`);
            });
        } else {
            console.log('   No ORB breakouts detected (normal if before 9:35 AM or no breakouts)');
        }
        console.log('');
        
        // 4. Check opening ranges
        console.log('📈 Checking opening ranges...');
        const stocksWithRanges = rockets.filter(r => r.openingRange);
        
        if (stocksWithRanges.length > 0) {
            console.log(`   Found ${stocksWithRanges.length} stocks with opening ranges:`);
            stocksWithRanges.slice(0, 5).forEach(stock => {
                const range = stock.openingRange;
                console.log(`   - ${stock.symbol}: $${range.low.toFixed(2)} - $${range.high.toFixed(2)} (range: $${range.range.toFixed(2)})`);
            });
        } else {
            console.log('   No opening ranges set (normal if before 9:35 AM)');
        }
        console.log('');
        
        // 5. Check momentum preservation
        console.log('📊 Checking momentum data preservation...');
        const stocksWithMomentum = rockets.filter(r => r.momentum && r.trend);
        
        if (stocksWithMomentum.length > 0) {
            console.log(`   Found ${stocksWithMomentum.length} stocks with momentum data:`);
            stocksWithMomentum.slice(0, 5).forEach(stock => {
                console.log(`   - ${stock.symbol}: ${stock.trend} (${stock.direction})`);
            });
        } else {
            console.log('   Limited momentum data (builds up over time)');
        }
        console.log('');
        
        // Summary
        console.log('✅ Market Open Features Summary:');
        console.log(`   • Market Session: ${marketSession.session}`);
        console.log(`   • Gap Stocks: ${gapStocks.length}`);
        console.log(`   • ORB Signals: ${orbStocks.length}`);
        console.log(`   • Opening Ranges: ${stocksWithRanges.length}`);
        console.log(`   • Momentum Data: ${stocksWithMomentum.length}`);
        console.log('');
        
        if (marketSession.session === 'regular') {
            console.log('💡 Tips for testing at market open (9:30 AM ET):');
            console.log('   1. Gap detection triggers 30 seconds after open');
            console.log('   2. Opening ranges lock in 5 minutes after open');
            console.log('   3. ORB signals appear after 9:35 AM on breakouts');
            console.log('   4. Price history carries over from pre-market');
        } else {
            console.log(`⏰ Current session: ${marketSession.description}`);
            console.log('   Market open features activate at 9:30 AM ET');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('   Response:', error.response.data);
        }
    }
}

// Run test
testMarketOpen();