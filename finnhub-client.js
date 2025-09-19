const finnhub = require('finnhub');

class FinnhubClient {
    constructor(apiKey) {
        const api_key = finnhub.ApiClient.instance.authentications['api_key'];
        api_key.apiKey = apiKey || 'ct90j39r01qhb3v7tnqgct90j39r01qhb3v7tnr0'; // Free tier API key
        this.finnhubClient = new finnhub.DefaultApi();

        // Rate limiting
        this.requestQueue = [];
        this.requestCount = 0;
        this.lastReset = Date.now();
        this.MAX_REQUESTS_PER_MINUTE = 60; // Free tier limit
    }

    // Rate limiter
    async checkRateLimit() {
        const now = Date.now();
        const timeSinceReset = now - this.lastReset;

        // Reset counter every minute
        if (timeSinceReset > 60000) {
            this.requestCount = 0;
            this.lastReset = now;
        }

        // If we're at the limit, wait
        if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
            const waitTime = 60000 - timeSinceReset;
            console.log(`Rate limit reached, waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this.requestCount = 0;
            this.lastReset = Date.now();
        }

        this.requestCount++;
    }

    // Get real-time quote for a single symbol
    async getQuote(symbol) {
        await this.checkRateLimit();

        return new Promise((resolve, reject) => {
            this.finnhubClient.quote(symbol, (error, data, response) => {
                if (error) {
                    console.error(`Error fetching quote for ${symbol}:`, error);
                    reject(error);
                } else {
                    // Add symbol to the data
                    data.symbol = symbol;
                    resolve(data);
                }
            });
        });
    }

    // Get quotes for multiple symbols (batched with rate limiting)
    async getQuotes(symbols) {
        const quotes = [];
        const errors = [];

        // Process symbols in batches to respect rate limits
        for (const symbol of symbols) {
            try {
                const quote = await this.getQuote(symbol);
                quotes.push(quote);
            } catch (error) {
                errors.push({ symbol, error: error.message });
            }
        }

        if (errors.length > 0) {
            console.warn('Failed to fetch quotes for:', errors);
        }

        return quotes;
    }

    // Get market status
    async getMarketStatus() {
        await this.checkRateLimit();

        return new Promise((resolve, reject) => {
            this.finnhubClient.marketStatus('US', (error, data, response) => {
                if (error) {
                    console.error('Error fetching market status:', error);
                    reject(error);
                } else {
                    resolve(data);
                }
            });
        });
    }

    // Search for symbols
    async searchSymbol(query) {
        await this.checkRateLimit();

        return new Promise((resolve, reject) => {
            this.finnhubClient.symbolSearch(query, (error, data, response) => {
                if (error) {
                    console.error('Error searching symbols:', error);
                    reject(error);
                } else {
                    resolve(data);
                }
            });
        });
    }

    // Get company profile
    async getCompanyProfile(symbol) {
        await this.checkRateLimit();

        return new Promise((resolve, reject) => {
            this.finnhubClient.companyProfile2({ symbol }, (error, data, response) => {
                if (error) {
                    console.error(`Error fetching profile for ${symbol}:`, error);
                    reject(error);
                } else {
                    resolve(data);
                }
            });
        });
    }

    // Convert Finnhub quote to our internal format
    formatQuoteData(quote, previousClose = null) {
        const current = quote.c || 0;
        const open = quote.o || 0;
        const high = quote.h || 0;
        const low = quote.l || 0;
        const prevClose = previousClose || quote.pc || 0;

        // Calculate change percentage
        let changePercent = 0;
        if (prevClose && prevClose !== 0) {
            changePercent = ((current - prevClose) / prevClose) * 100;
        }

        // Determine if this is extended hours based on timestamp
        const now = new Date();
        const marketOpen = new Date(now);
        marketOpen.setHours(9, 30, 0, 0); // 9:30 AM ET
        const marketClose = new Date(now);
        marketClose.setHours(16, 0, 0, 0); // 4:00 PM ET

        const isRegularHours = now >= marketOpen && now <= marketClose;
        const isExtendedHours = !isRegularHours && quote.t;

        return {
            symbol: quote.symbol,
            price: current,
            open: open,
            high: high,
            low: low,
            previousClose: prevClose,
            change: current - prevClose,
            changePercent: changePercent,
            volume: quote.v || 0,
            timestamp: quote.t ? new Date(quote.t * 1000) : new Date(),
            isRealTime: true, // Finnhub provides real-time data
            isExtendedHours: isExtendedHours,
            source: 'finnhub'
        };
    }

    // Get top movers (gainers/losers) - Note: Not available on free tier
    // We'll need to calculate this ourselves by fetching quotes for a list of symbols
    async getTopMovers(symbols, type = 'gainers', limit = 20) {
        const quotes = await this.getQuotes(symbols);

        // Calculate changes and sort
        const moversData = quotes.map(quote => {
            const data = this.formatQuoteData(quote);
            return {
                symbol: data.symbol,
                price: data.price,
                change: data.change,
                changePercent: data.changePercent,
                volume: data.volume,
                timestamp: data.timestamp
            };
        }).filter(item => item.changePercent !== 0);

        // Sort by change percentage
        if (type === 'gainers') {
            moversData.sort((a, b) => b.changePercent - a.changePercent);
        } else {
            moversData.sort((a, b) => a.changePercent - b.changePercent);
        }

        return moversData.slice(0, limit);
    }

    // WebSocket connection for real-time updates
    createWebSocket(symbols, onMessage) {
        const socket = new WebSocket('wss://ws.finnhub.io?token=ct90j39r01qhb3v7tnqgct90j39r01qhb3v7tnr0');

        socket.addEventListener('open', function (event) {
            // Subscribe to symbols
            symbols.forEach(symbol => {
                socket.send(JSON.stringify({'type':'subscribe', 'symbol': symbol}));
            });
            console.log('Finnhub WebSocket connected, subscribed to', symbols.length, 'symbols');
        });

        socket.addEventListener('message', function (event) {
            const message = JSON.parse(event.data);
            if (message.type === 'trade' && message.data) {
                onMessage(message.data);
            }
        });

        socket.addEventListener('error', function (event) {
            console.error('Finnhub WebSocket error:', event);
        });

        socket.addEventListener('close', function (event) {
            console.log('Finnhub WebSocket disconnected');
        });

        return socket;
    }
}

module.exports = FinnhubClient;