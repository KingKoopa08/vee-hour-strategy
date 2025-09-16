const WebSocket = require('ws');
const EventEmitter = require('events');

class PolygonWebSocket extends EventEmitter {
    constructor(apiKey) {
        super();
        this.apiKey = apiKey;
        this.ws = null;
        this.reconnectDelay = 5000;
        this.subscribedSymbols = new Set();
        this.isConnected = false;
    }

    connect() {
        const wsUrl = 'wss://socket.polygon.io/stocks';
        
        console.log('🔌 Connecting to Polygon WebSocket...');
        this.ws = new WebSocket(wsUrl);
        
        this.ws.on('open', () => {
            console.log('✅ Connected to Polygon WebSocket');
            this.isConnected = true;
            
            // Authenticate
            this.authenticate();
        });
        
        this.ws.on('message', (data) => {
            this.handleMessage(data);
        });
        
        this.ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
            this.emit('error', error);
        });
        
        this.ws.on('close', () => {
            console.log('🔌 WebSocket disconnected, reconnecting...');
            this.isConnected = false;
            setTimeout(() => this.connect(), this.reconnectDelay);
        });
    }
    
    authenticate() {
        const authMsg = {
            action: 'auth',
            params: this.apiKey
        };
        this.send(authMsg);
    }
    
    handleMessage(data) {
        try {
            const messages = JSON.parse(data.toString());
            
            messages.forEach(msg => {
                switch(msg.ev) {
                    case 'status':
                        if (msg.status === 'auth_success') {
                            console.log('✅ Authentication successful');
                            // Subscribe to all previously subscribed symbols
                            if (this.subscribedSymbols.size > 0) {
                                this.subscribeToSymbols([...this.subscribedSymbols]);
                            }
                        }
                        break;
                    
                    case 'T': // Trade
                        this.handleTrade(msg);
                        break;
                    
                    case 'Q': // Quote
                        this.handleQuote(msg);
                        break;
                    
                    case 'A': // Aggregate (Second)
                        this.handleAggregate(msg);
                        break;
                    
                    case 'AM': // Aggregate (Minute)
                        this.handleMinuteAggregate(msg);
                        break;
                }
            });
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }
    
    handleTrade(trade) {
        const tradeData = {
            symbol: trade.sym,
            price: trade.p,
            size: trade.s,
            timestamp: trade.t,
            conditions: trade.c || []
        };
        
        this.emit('trade', tradeData);
        
        // Check for unusual activity
        if (trade.s > 10000) { // Large trade
            this.emit('large_trade', tradeData);
        }
    }
    
    handleQuote(quote) {
        const quoteData = {
            symbol: quote.sym,
            bidPrice: quote.bp,
            bidSize: quote.bs,
            askPrice: quote.ap,
            askSize: quote.as,
            timestamp: quote.t
        };
        
        this.emit('quote', quoteData);
        
        // Check for wide spread (potential volatility)
        const spread = ((quote.ap - quote.bp) / quote.bp) * 100;
        if (spread > 1) { // Spread > 1%
            this.emit('wide_spread', { ...quoteData, spreadPercent: spread });
        }
    }
    
    handleAggregate(agg) {
        const aggData = {
            symbol: agg.sym,
            open: agg.o,
            high: agg.h,
            low: agg.l,
            close: agg.c,
            volume: agg.v,
            vwap: agg.vw,
            timestamp: agg.s
        };
        
        this.emit('aggregate', aggData);
    }
    
    handleMinuteAggregate(agg) {
        const aggData = {
            symbol: agg.sym,
            open: agg.o,
            high: agg.h,
            low: agg.l,
            close: agg.c,
            volume: agg.v,
            vwap: agg.vw,
            timestamp: agg.s,
            trades: agg.n
        };
        
        this.emit('minute_bar', aggData);
        
        // Check for volume spike
        // You'd compare this to average volume here
        if (agg.v > 1000000) {
            this.emit('volume_spike', aggData);
        }
    }
    
    subscribeToSymbols(symbols) {
        if (!Array.isArray(symbols)) {
            symbols = [symbols];
        }
        
        // Add to tracked symbols
        symbols.forEach(s => this.subscribedSymbols.add(s));
        
        const subscriptions = symbols.flatMap(symbol => [
            `T.${symbol}`,    // Trades
            `Q.${symbol}`,    // Quotes
            `A.${symbol}`,    // Second aggregates
            `AM.${symbol}`    // Minute aggregates
        ]);
        
        const subMsg = {
            action: 'subscribe',
            params: subscriptions.join(',')
        };
        
        this.send(subMsg);
        console.log(`📊 Subscribed to real-time data for: ${symbols.join(', ')}`);
    }
    
    unsubscribeFromSymbols(symbols) {
        if (!Array.isArray(symbols)) {
            symbols = [symbols];
        }
        
        // Remove from tracked symbols
        symbols.forEach(s => this.subscribedSymbols.delete(s));
        
        const subscriptions = symbols.flatMap(symbol => [
            `T.${symbol}`,
            `Q.${symbol}`,
            `A.${symbol}`,
            `AM.${symbol}`
        ]);
        
        const unsubMsg = {
            action: 'unsubscribe',
            params: subscriptions.join(',')
        };
        
        this.send(unsubMsg);
        console.log(`📊 Unsubscribed from: ${symbols.join(', ')}`);
    }
    
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

module.exports = PolygonWebSocket;