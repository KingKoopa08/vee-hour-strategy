// Test Discord Alerts with Real Post-Market Data
const axios = require('axios');
const fs = require('fs').promises;

// Load admin settings to get webhook URLs
async function loadWebhooks() {
    try {
        const data = await fs.readFile('admin-settings.json', 'utf8');
        const settings = JSON.parse(data);
        return settings.webhooks;
    } catch (error) {
        console.error('Error loading webhooks:', error.message);
        return null;
    }
}

// Send formatted Discord alert
async function sendDiscordAlert(webhookUrl, alertData, type = 'rocket') {
    if (!webhookUrl || !webhookUrl.includes('discord.com')) {
        console.log(`❌ Invalid webhook URL for ${type}`);
        return false;
    }
    
    let embed;
    
    if (type === 'rocket') {
        // Determine color based on level
        const color = alertData.level === 4 ? 0xFF0000 : // Red for JACKPOT
                     alertData.level === 3 ? 0xFF6432 : // Orange for URGENT
                     alertData.level === 2 ? 0xFFC832 : // Yellow for ALERT
                     0x6464FF; // Blue for WATCH
        
        const levelEmoji = alertData.level === 4 ? '🚀 JACKPOT' :
                          alertData.level === 3 ? '🔥 URGENT' :
                          alertData.level === 2 ? '⚡ ALERT' :
                          '👀 WATCH';
        
        embed = {
            embeds: [{
                title: `${levelEmoji}: ${alertData.symbol}`,
                description: alertData.news || `Massive ${alertData.change > 0 ? 'gain' : 'move'} detected!`,
                color: color,
                fields: [
                    { 
                        name: '💰 Price', 
                        value: `$${alertData.price.toFixed(2)}`, 
                        inline: true 
                    },
                    { 
                        name: alertData.change > 0 ? '📈 Change' : '📉 Change', 
                        value: `${alertData.change > 0 ? '+' : ''}${alertData.change.toFixed(1)}%`, 
                        inline: true 
                    },
                    { 
                        name: '📊 Volume', 
                        value: alertData.volume >= 1000000 ? 
                            `${(alertData.volume / 1000000).toFixed(1)}M` : 
                            `${(alertData.volume / 1000).toFixed(0)}K`, 
                        inline: true 
                    },
                    { 
                        name: '📏 VWAP', 
                        value: `$${(alertData.vwap || alertData.price).toFixed(2)}`, 
                        inline: true 
                    },
                    { 
                        name: '📈 Day Range', 
                        value: `$${alertData.low?.toFixed(2) || '?'} - $${alertData.high?.toFixed(2) || '?'}`, 
                        inline: true 
                    },
                    { 
                        name: '🎯 Entry Strategy', 
                        value: alertData.level === 4 ? 'EXTREME CAUTION - High volatility!' :
                               alertData.level === 3 ? 'Watch for pullback to VWAP' :
                               'Monitor for continuation pattern', 
                        inline: false 
                    }
                ],
                footer: {
                    text: '⚠️ Not financial advice • Set stops • Manage risk!',
                    icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
                },
                timestamp: new Date().toISOString()
            }]
        };
    } else if (type === 'news') {
        embed = {
            embeds: [{
                title: `📰 Breaking News: ${alertData.symbol || 'Market'}`,
                description: alertData.headline,
                color: 0x00FF00, // Green for news
                fields: [
                    {
                        name: 'Impact',
                        value: alertData.impact || 'Monitoring for market reaction',
                        inline: false
                    }
                ],
                footer: {
                    text: 'News Alert • Rocket Scanner',
                    icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
                },
                timestamp: new Date().toISOString()
            }]
        };
    }
    
    try {
        const response = await axios.post(webhookUrl, embed);
        if (response.status === 204) {
            console.log(`✅ ${type.toUpperCase()} alert sent for ${alertData.symbol}!`);
            return true;
        }
    } catch (error) {
        console.error(`❌ Failed to send ${type} alert:`, error.message);
        if (error.response) {
            console.error('Discord error:', error.response.data);
        }
        return false;
    }
}

async function testDiscordAlerts() {
    console.log('🚀 TESTING DISCORD ALERTS WITH REAL POST-MARKET DATA\n');
    console.log('Time:', new Date().toLocaleString(), '\n');
    
    // Load webhooks
    const webhooks = await loadWebhooks();
    if (!webhooks) {
        console.log('❌ Could not load webhook configuration');
        return;
    }
    
    console.log('📡 Webhook Configuration:');
    console.log(`  Rocket webhook: ${webhooks.rocket ? '✅ Configured' : '❌ Not set'}`);
    console.log(`  News webhook: ${webhooks.news ? '✅ Configured' : '❌ Not set'}`);
    console.log(`  Urgent webhook: ${webhooks.urgent ? '✅ Configured' : '❌ Not set'}`);
    console.log('');
    
    // Get current market data
    console.log('📊 Fetching post-market data...\n');
    
    try {
        const response = await axios.get('http://localhost:3018/api/stocks/top-volume');
        const stocks = response.data.stocks || [];
        
        // Find the biggest movers for testing
        const rockets = stocks
            .filter(s => Math.abs(s.priceChangePercent) > 50 && s.volume > 50000000)
            .sort((a, b) => Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent))
            .slice(0, 3);
        
        if (rockets.length === 0) {
            console.log('No major rockets found in current data. Using test data...\n');
            
            // Use test data
            rockets.push({
                symbol: 'TEST',
                price: 10.50,
                priceChangePercent: 125.5,
                volume: 75000000,
                high: 11.20,
                low: 4.50,
                vwap: 8.75
            });
        }
        
        console.log(`Found ${rockets.length} rockets to test:\n`);
        
        // Test each rocket alert
        for (let i = 0; i < rockets.length; i++) {
            const rocket = rockets[i];
            
            // Determine alert level
            let level = 1;
            const change = Math.abs(rocket.priceChangePercent);
            if (change >= 100) level = 4;
            else if (change >= 50) level = 3;
            else if (change >= 25) level = 2;
            
            const alertData = {
                symbol: rocket.symbol,
                price: rocket.price,
                change: rocket.priceChangePercent,
                volume: rocket.volume,
                level: level,
                vwap: rocket.vwap || rocket.price,
                high: rocket.high,
                low: rocket.low,
                news: i === 0 ? 'Major catalyst detected - Testing Discord integration' : null
            };
            
            console.log(`\n${i + 1}. Testing ${rocket.symbol} (Level ${level} - ${change.toFixed(1)}% move):`);
            
            // Determine which webhook to use
            let webhookUrl = webhooks.rocket;
            if (level >= 3 && webhooks.urgent && webhooks.urgent.includes('discord.com')) {
                webhookUrl = webhooks.urgent;
                console.log('   Using URGENT webhook for high-priority alert');
            } else {
                console.log('   Using standard ROCKET webhook');
            }
            
            // Send the alert
            await sendDiscordAlert(webhookUrl, alertData, 'rocket');
            
            // Wait 2 seconds between alerts
            if (i < rockets.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // Test news alert
        console.log('\n📰 Testing NEWS alert:');
        
        const newsData = {
            symbol: 'MARKET',
            headline: 'Rocket Scanner Test: Multiple explosive movers detected in after-hours trading!',
            impact: 'High volatility expected in pre-market tomorrow'
        };
        
        if (webhooks.news && webhooks.news.includes('discord.com')) {
            await sendDiscordAlert(webhooks.news, newsData, 'news');
        } else {
            console.log('   News webhook not configured');
        }
        
        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('✨ DISCORD ALERT TEST COMPLETE!');
        console.log('='.repeat(60));
        console.log('\n📱 Check your Discord channels for the alerts!');
        console.log('\nAlert Levels Explained:');
        console.log('  🚀 JACKPOT (L4): >100% gain with massive volume');
        console.log('  🔥 URGENT (L3): 50-100% gain with high volume');
        console.log('  ⚡ ALERT (L2): 25-50% gain with good volume');
        console.log('  👀 WATCH (L1): 5-25% gain with decent volume');
        
    } catch (error) {
        console.error('Error fetching market data:', error.message);
    }
}

// Run the test
testDiscordAlerts().catch(console.error);