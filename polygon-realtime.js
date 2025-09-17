const WebSocket = require('ws');
const EventEmitter = require('events');

class PolygonRealtimeClient extends EventEmitter {
    constructor(apiKey) {
        super();
        this.apiKey = apiKey;
        this.ws = null;
        this.authenticated = false;
        this.subscriptions = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        // Track trades for spike detection
        this.tradeHistory = new Map(); // symbol -> array of recent trades
        this.spikeDetectors = new Map(); // symbol -> spike state
        this.activeSpikes = new Map(); // symbol -> spike data

        // Configuration - more sensitive for after-hours
        this.config = {
            maxPrice: 100,
            minVolumeBurst: 2, // Lowered from 5x to 2x for after-hours
            minDollarVolume: 50000, // Lowered from 500k for after-hours
            minPriceChange: 0.5, // 0.5% instead of 1%
            spikeWindow: 10000, // 10 seconds
            historyWindow: 60000, // 60 seconds for baseline
            maxTradesStored: 1000 // per symbol
        };
    }

    connect() {
        console.log('🔌 Connecting to Polygon WebSocket...');

        // Polygon stocks cluster WebSocket
        this.ws = new WebSocket('wss://socket.polygon.io/stocks');

        this.ws.on('open', () => {
            console.log('📡 Polygon WebSocket connected');
            this.authenticate();
        });

        this.ws.on('message', (data) => {
            this.handleMessage(JSON.parse(data.toString()));
        });

        this.ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error.message);
        });

        this.ws.on('close', () => {
            console.log('🔌 WebSocket disconnected');
            this.handleReconnect();
        });
    }

    authenticate() {
        console.log('🔐 Authenticating with Polygon...');
        this.send({
            action: 'auth',
            params: this.apiKey
        });
    }

    handleMessage(message) {
        // Handle different message types
        if (message[0]) {
            const event = message[0];

            // Debug: Log message types
            if (!this.messageTypesLogged) {
                this.messageTypesLogged = new Set();
            }
            if (!this.messageTypesLogged.has(event.ev)) {
                console.log(`📨 Received message type: ${event.ev}`, event);
                this.messageTypesLogged.add(event.ev);
            }

            switch(event.ev) {
                case 'status':
                    this.handleStatus(event);
                    break;

                case 'T': // Trade
                    this.handleTrade(event);
                    break;

                case 'Q': // Quote
                    this.handleQuote(event);
                    break;

                case 'A': // Aggregate (second/minute bar)
                    this.handleAggregate(event);
                    break;

                case 'AM': // Aggregate minute
                    this.handleMinuteAggregate(event);
                    break;
            }
        }
    }

    handleStatus(event) {
        if (event.status === 'auth_success') {
            console.log('✅ Polygon authentication successful');
            this.authenticated = true;
            this.emit('authenticated');
            this.subscribeToDefaults();
        } else if (event.status === 'auth_failed') {
            console.error('❌ Polygon authentication failed');
            this.emit('error', new Error('Authentication failed'));
        }
    }

    handleTrade(trade) {
        const symbol = trade.sym;
        const price = trade.p;
        const size = trade.s;
        const timestamp = trade.t;

        // Debug: Log first few trades
        if (!this.tradeHistory.has(symbol)) {
            console.log(`📊 First trade for ${symbol}: $${price} x ${size} shares`);
        }

        // Store trade in history
        if (!this.tradeHistory.has(symbol)) {
            this.tradeHistory.set(symbol, []);
        }

        const history = this.tradeHistory.get(symbol);
        history.push({
            price,
            size,
            timestamp,
            dollarVolume: price * size
        });

        // Limit history size
        if (history.length > this.config.maxTradesStored) {
            history.shift();
        }

        // Check for spike
        this.detectSpike(symbol);

        // Emit trade event
        this.emit('trade', {
            symbol,
            price,
            size,
            timestamp
        });
    }

    detectSpike(symbol) {
        const history = this.tradeHistory.get(symbol);
        if (!history || history.length < 10) return;

        const now = Date.now();
        const spikeWindowStart = now - this.config.spikeWindow;
        const baselineWindowStart = now - this.config.historyWindow;

        // Get trades in spike window (last 10 seconds)
        const spikeTrades = history.filter(t => t.timestamp > spikeWindowStart);
        if (spikeTrades.length < 5) return; // Need minimum trades

        // Get baseline trades (last 60 seconds)
        const baselineTrades = history.filter(t =>
            t.timestamp > baselineWindowStart && t.timestamp <= spikeWindowStart
        );

        if (baselineTrades.length < 10) return; // Need baseline data

        // Calculate metrics
        const spikeMetrics = this.calculateMetrics(spikeTrades);
        const baselineMetrics = this.calculateMetrics(baselineTrades);

        // Calculate volume burst ratio
        const volumeBurst = baselineMetrics.volumeRate > 0 ?
            spikeMetrics.volumeRate / baselineMetrics.volumeRate : 0;

        // Price change in spike window
        const priceChange = spikeTrades.length > 1 ?
            ((spikeTrades[spikeTrades.length - 1].price - spikeTrades[0].price) / spikeTrades[0].price) * 100 : 0;

        // Check if this is a spike
        const isSpike =
            volumeBurst >= this.config.minVolumeBurst &&
            priceChange >= this.config.minPriceChange && // Use config value
            spikeMetrics.dollarVolume >= this.config.minDollarVolume / 6 && // Pro-rated for 10 seconds
            spikeMetrics.currentPrice <= this.config.maxPrice &&
            spikeMetrics.upticks >= spikeMetrics.downticks; // At least equal up/down

        // Handle spike detection
        if (isSpike && !this.activeSpikes.has(symbol)) {
            // New spike detected!
            const spikeData = {
                symbol,
                startTime: now,
                startPrice: spikeTrades[0].price,
                currentPrice: spikeMetrics.currentPrice,
                highPrice: spikeMetrics.highPrice,
                priceChange,
                volumeBurst,
                dollarVolume: spikeMetrics.dollarVolume,
                tradeCount: spikeTrades.length,
                momentum: 'ACCELERATING',
                duration: 0
            };

            this.activeSpikes.set(symbol, spikeData);

            // Emit spike alert
            this.emit('spike', spikeData);

            console.log(`🚨 SPIKE DETECTED: ${symbol} +${priceChange.toFixed(2)}% with ${volumeBurst.toFixed(1)}x volume`);

        } else if (this.activeSpikes.has(symbol)) {
            // Update existing spike
            const spike = this.activeSpikes.get(symbol);
            spike.currentPrice = spikeMetrics.currentPrice;
            spike.highPrice = Math.max(spike.highPrice, spikeMetrics.currentPrice);
            spike.priceChange = ((spike.currentPrice - spike.startPrice) / spike.startPrice) * 100;
            spike.duration = (now - spike.startTime) / 1000;
            spike.volumeBurst = volumeBurst;

            // Check momentum
            const recentTrades = spikeTrades.slice(-5);
            const momentum = this.calculateMomentum(recentTrades);
            spike.momentum = momentum;

            // Check if spike is ending
            if (spike.duration > 120 || // 2 minutes max
                spike.momentum === 'REVERSING' ||
                volumeBurst < 2) { // Volume dying

                // Spike ended
                this.emit('spikeEnd', spike);
                this.activeSpikes.delete(symbol);
                console.log(`📉 Spike ended: ${symbol} peaked at +${spike.priceChange.toFixed(2)}% after ${spike.duration}s`);
            } else {
                // Spike continuing
                this.emit('spikeUpdate', spike);
            }
        }
    }

    calculateMetrics(trades) {
        if (!trades || trades.length === 0) {
            return {
                volumeRate: 0,
                dollarVolume: 0,
                upticks: 0,
                downticks: 0,
                currentPrice: 0,
                highPrice: 0
            };
        }

        let totalVolume = 0;
        let dollarVolume = 0;
        let upticks = 0;
        let downticks = 0;
        let highPrice = 0;

        for (let i = 0; i < trades.length; i++) {
            const trade = trades[i];
            totalVolume += trade.size;
            dollarVolume += trade.dollarVolume;
            highPrice = Math.max(highPrice, trade.price);

            if (i > 0) {
                if (trade.price > trades[i-1].price) upticks++;
                else if (trade.price < trades[i-1].price) downticks++;
            }
        }

        const timeSpan = trades.length > 1 ?
            (trades[trades.length-1].timestamp - trades[0].timestamp) / 1000 : 1;

        return {
            volumeRate: totalVolume / Math.max(timeSpan, 1),
            dollarVolume,
            upticks,
            downticks,
            currentPrice: trades[trades.length-1].price,
            highPrice
        };
    }

    calculateMomentum(trades) {
        if (!trades || trades.length < 3) return 'UNKNOWN';

        // Check last 3-5 trades for direction
        let ups = 0;
        let downs = 0;

        for (let i = 1; i < trades.length; i++) {
            if (trades[i].price > trades[i-1].price) ups++;
            else if (trades[i].price < trades[i-1].price) downs++;
        }

        if (ups > downs * 2) return 'ACCELERATING';
        if (downs > ups * 2) return 'REVERSING';
        if (Math.abs(ups - downs) <= 1) return 'SLOWING';
        return 'MIXED';
    }

    handleQuote(quote) {
        // Handle bid/ask updates for spread calculation
        this.emit('quote', {
            symbol: quote.sym,
            bid: quote.bp,
            ask: quote.ap,
            bidSize: quote.bs,
            askSize: quote.as,
            spread: quote.ap - quote.bp,
            spreadPercent: ((quote.ap - quote.bp) / quote.bp) * 100
        });
    }

    handleAggregate(aggregate) {
        // Handle second bars for smooth updates
        this.emit('aggregate', {
            symbol: aggregate.sym,
            open: aggregate.o,
            high: aggregate.h,
            low: aggregate.l,
            close: aggregate.c,
            volume: aggregate.v,
            timestamp: aggregate.s
        });
    }

    handleMinuteAggregate(aggregate) {
        // Handle minute bars for longer-term context
        this.emit('minuteBar', {
            symbol: aggregate.sym,
            open: aggregate.o,
            high: aggregate.h,
            low: aggregate.l,
            close: aggregate.c,
            volume: aggregate.v,
            timestamp: aggregate.s
        });
    }

    subscribe(symbols) {
        if (!this.authenticated) {
            console.log('⏳ Waiting for authentication...');
            this.once('authenticated', () => this.subscribe(symbols));
            return;
        }

        // Subscribe to trades, quotes, and aggregates
        const subscriptions = [];

        symbols.forEach(symbol => {
            subscriptions.push(`T.${symbol}`); // Trades
            subscriptions.push(`Q.${symbol}`); // Quotes
            subscriptions.push(`A.${symbol}`); // Second aggregates
            this.subscriptions.add(symbol);
        });

        console.log(`📊 Subscribing to ${symbols.length} symbols for real-time data`);

        this.send({
            action: 'subscribe',
            params: subscriptions.join(',')
        });
    }

    subscribeToDefaults() {
        // Subscribe to high-volume stocks for testing
        const defaultSymbols = [
            'SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA',
            'AMD', 'META', 'AMZN', 'MSFT', 'GOOGL'
        ];

        this.subscribe(defaultSymbols);
    }

    unsubscribe(symbols) {
        const unsubscriptions = [];

        symbols.forEach(symbol => {
            unsubscriptions.push(`T.${symbol}`);
            unsubscriptions.push(`Q.${symbol}`);
            unsubscriptions.push(`A.${symbol}`);
            this.subscriptions.delete(symbol);
        });

        this.send({
            action: 'unsubscribe',
            params: unsubscriptions.join(',')
        });
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 Reconnecting... (attempt ${this.reconnectAttempts})`);
            setTimeout(() => this.connect(), 5000);
        } else {
            console.error('❌ Max reconnection attempts reached');
            this.emit('error', new Error('Connection lost'));
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    getActiveSpikes() {
        return Array.from(this.activeSpikes.values());
    }

    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
}

module.exports = PolygonRealtimeClient;