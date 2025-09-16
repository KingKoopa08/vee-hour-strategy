const PolygonWebSocket = require('./polygon-websocket');
const axios = require('axios');

class RealtimeRocketDetector {
    constructor(apiKey, discordWebhook) {
        this.polygonWS = new PolygonWebSocket(apiKey);
        this.discordWebhook = discordWebhook;
        
        // Track data for each symbol
        this.symbolData = new Map();
        
        // Track alerts sent (to avoid spam)
        this.alertsSent = new Map();
        this.alertCooldown = 300000; // 5 minute cooldown per symbol
        
        // Rocket detection thresholds
        this.thresholds = {
            priceChangePercent: 5,    // 5% move in 1 minute
            volumeSpike: 10,           // 10x average volume
            largeTradeSize: 50000,     // 50k shares
            rapidTrades: 100,          // 100 trades per second
            spreadThreshold: 1         // 1% bid-ask spread
        };
        
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        // Handle real-time trades
        this.polygonWS.on('trade', (trade) => {
            this.processTrade(trade);
        });
        
        // Handle minute bars (best for detecting rockets)
        this.polygonWS.on('minute_bar', (bar) => {
            this.processMinuteBar(bar);
        });
        
        // Handle large trades
        this.polygonWS.on('large_trade', (trade) => {
            this.processLargeTrade(trade);
        });
        
        // Handle volume spikes
        this.polygonWS.on('volume_spike', (data) => {
            this.processVolumeSpike(data);
        });
        
        // Handle wide spreads (volatility indicator)
        this.polygonWS.on('wide_spread', (quote) => {
            this.processWideSpread(quote);
        });
    }
    
    start(symbols) {
        console.log('🚀 Starting Real-Time Rocket Detector');
        console.log(`📊 Monitoring ${symbols.length} symbols`);
        
        // Initialize symbol data
        symbols.forEach(symbol => {
            this.symbolData.set(symbol, {
                symbol: symbol,
                lastPrice: 0,
                lastVolume: 0,
                minuteOpen: 0,
                dayOpen: 0,
                avgVolume: 0,
                trades: [],
                lastAlert: 0,
                signals: new Set()
            });
        });
        
        // Connect to WebSocket
        this.polygonWS.connect();
        
        // Wait for connection then subscribe
        setTimeout(() => {
            this.polygonWS.subscribeToSymbols(symbols);
        }, 2000);
    }
    
    processTrade(trade) {
        const data = this.symbolData.get(trade.symbol);
        if (!data) return;
        
        // Update last price
        data.lastPrice = trade.price;
        
        // Track recent trades for velocity
        data.trades.push({
            price: trade.price,
            size: trade.size,
            time: Date.now()
        });
        
        // Keep only last 100 trades
        if (data.trades.length > 100) {
            data.trades.shift();
        }
        
        // Check for rapid trading (momentum indicator)
        const recentTrades = data.trades.filter(t => 
            Date.now() - t.time < 1000 // Last second
        );
        
        if (recentTrades.length > this.thresholds.rapidTrades) {
            data.signals.add('RAPID_TRADING');
            this.checkForRocket(data, 'Rapid Trading Detected');
        }
    }
    
    processMinuteBar(bar) {
        const data = this.symbolData.get(bar.symbol);
        if (!data) return;
        
        // Calculate price change
        if (data.minuteOpen > 0) {
            const changePercent = ((bar.close - data.minuteOpen) / data.minuteOpen) * 100;
            
            // Check for significant move
            if (Math.abs(changePercent) >= this.thresholds.priceChangePercent) {
                data.signals.add('PRICE_SPIKE');
                
                const rocket = {
                    symbol: bar.symbol,
                    changePercent: changePercent,
                    price: bar.close,
                    volume: bar.volume,
                    vwap: bar.vwap,
                    high: bar.high,
                    low: bar.low,
                    trades: bar.trades,
                    trigger: `${changePercent.toFixed(2)}% move in 1 minute`
                };
                
                this.detectRocket(rocket);
            }
        }
        
        // Update data
        data.minuteOpen = bar.close;
        data.lastVolume = bar.volume;
        
        // Check volume spike
        if (data.avgVolume > 0) {
            const volumeRatio = bar.volume / data.avgVolume;
            if (volumeRatio > this.thresholds.volumeSpike) {
                data.signals.add('VOLUME_SPIKE');
                this.checkForRocket(data, `${volumeRatio.toFixed(1)}x volume spike`);
            }
        }
    }
    
    processLargeTrade(trade) {
        const data = this.symbolData.get(trade.symbol);
        if (!data) return;
        
        data.signals.add('LARGE_TRADE');
        
        const value = trade.price * trade.size;
        const alert = {
            symbol: trade.symbol,
            type: 'LARGE_TRADE',
            price: trade.price,
            size: trade.size,
            value: value,
            trigger: `${trade.size.toLocaleString()} shares @ $${trade.price}`
        };
        
        this.checkForRocket(data, alert.trigger);
    }
    
    processVolumeSpike(data) {
        const symbolData = this.symbolData.get(data.symbol);
        if (!symbolData) return;
        
        symbolData.signals.add('VOLUME_SURGE');
        this.checkForRocket(symbolData, 'Massive volume surge detected');
    }
    
    processWideSpread(quote) {
        const data = this.symbolData.get(quote.symbol);
        if (!data) return;
        
        data.signals.add('HIGH_VOLATILITY');
        
        if (quote.spreadPercent > 2) {
            this.checkForRocket(data, `${quote.spreadPercent.toFixed(1)}% spread - High volatility`);
        }
    }
    
    checkForRocket(data, trigger) {
        // Need multiple signals for a rocket
        if (data.signals.size >= 2) {
            const rocket = {
                symbol: data.symbol,
                price: data.lastPrice,
                signals: Array.from(data.signals),
                trigger: trigger,
                timestamp: new Date().toISOString()
            };
            
            this.detectRocket(rocket);
            
            // Clear signals after alert
            data.signals.clear();
        }
    }
    
    detectRocket(rocket) {
        // Check cooldown
        const lastAlert = this.alertsSent.get(rocket.symbol) || 0;
        if (Date.now() - lastAlert < this.alertCooldown) {
            return; // Skip if recently alerted
        }
        
        console.log(`🚀 ROCKET DETECTED: ${rocket.symbol}`);
        console.log(`   Trigger: ${rocket.trigger}`);
        console.log(`   Price: $${rocket.price}`);
        if (rocket.signals) {
            console.log(`   Signals: ${rocket.signals.join(', ')}`);
        }
        
        // Send Discord alert
        this.sendDiscordAlert(rocket);
        
        // Update last alert time
        this.alertsSent.set(rocket.symbol, Date.now());
        
        // Emit event for other systems
        this.polygonWS.emit('rocket_detected', rocket);
    }
    
    async sendDiscordAlert(rocket) {
        if (!this.discordWebhook) return;
        
        try {
            const embed = {
                embeds: [{
                    title: `🚀 REAL-TIME ROCKET: ${rocket.symbol}`,
                    description: rocket.trigger,
                    color: rocket.changePercent > 20 ? 0xFF0000 : 
                           rocket.changePercent > 10 ? 0xFF6432 : 0xFFC832,
                    fields: [
                        {
                            name: 'Price',
                            value: `$${rocket.price?.toFixed(2) || 'N/A'}`,
                            inline: true
                        },
                        {
                            name: 'Change',
                            value: rocket.changePercent ? `${rocket.changePercent.toFixed(2)}%` : 'N/A',
                            inline: true
                        },
                        {
                            name: 'Volume',
                            value: rocket.volume ? `${(rocket.volume / 1000000).toFixed(2)}M` : 'N/A',
                            inline: true
                        }
                    ],
                    footer: {
                        text: 'Real-Time Rocket Detection'
                    },
                    timestamp: rocket.timestamp || new Date().toISOString()
                }]
            };
            
            await axios.post(this.discordWebhook, embed);
        } catch (error) {
            console.error('Failed to send Discord alert:', error.message);
        }
    }
    
    updateAverageVolume(symbol, volume) {
        const data = this.symbolData.get(symbol);
        if (!data) return;
        
        // Simple moving average
        if (data.avgVolume === 0) {
            data.avgVolume = volume;
        } else {
            data.avgVolume = (data.avgVolume * 0.9) + (volume * 0.1);
        }
    }
    
    stop() {
        console.log('Stopping Real-Time Rocket Detector');
        this.polygonWS.disconnect();
    }
}

module.exports = RealtimeRocketDetector;