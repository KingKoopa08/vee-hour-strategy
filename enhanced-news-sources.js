// Enhanced News Aggregation System
// Multiple sources for comprehensive catalyst detection

const axios = require('axios');

// News source configuration
const NEWS_SOURCES = {
    
    // 1. FREE NEWS APIs (No API key required)
    reddit: {
        name: 'Reddit WSB/Stocks',
        endpoints: {
            wsb: 'https://www.reddit.com/r/wallstreetbets/hot.json?limit=10',
            stocks: 'https://www.reddit.com/r/stocks/hot.json?limit=10',
            pennystocks: 'https://www.reddit.com/r/pennystocks/hot.json?limit=10',
            stockmarket: 'https://www.reddit.com/r/StockMarket/hot.json?limit=10'
        },
        parser: (data) => {
            const posts = [];
            if (data.data && data.data.children) {
                data.data.children.forEach(child => {
                    const post = child.data;
                    // Extract tickers mentioned (e.g., $AAPL or AAPL)
                    const tickers = post.title.match(/\$?[A-Z]{1,5}\b/g) || [];
                    posts.push({
                        title: post.title,
                        score: post.score,
                        comments: post.num_comments,
                        url: `https://reddit.com${post.permalink}`,
                        tickers: tickers.map(t => t.replace('$', '')),
                        created: new Date(post.created_utc * 1000)
                    });
                });
            }
            return posts;
        }
    },
    
    // 2. RSS Feeds (Free, no API needed)
    rssFeeds: {
        name: 'Financial RSS Feeds',
        feeds: {
            marketwatch: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
            seekingAlpha: 'https://seekingalpha.com/market_currents.xml',
            bloomberg: 'https://feeds.bloomberg.com/markets/news.rss',
            cnbc: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
            yahooFinance: 'https://finance.yahoo.com/rss/topstories'
        }
    },
    
    // 3. SEC EDGAR Filings (Free, official source)
    sec: {
        name: 'SEC EDGAR',
        endpoints: {
            recent: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=&company=&dateb=&owner=include&start=0&count=20&output=atom',
            forms: {
                '8-K': 'Current Report (major events)',
                '10-K': 'Annual Report',
                '10-Q': 'Quarterly Report',
                'S-1': 'IPO Registration',
                '13D': '5% Ownership',
                '13F': 'Institutional Holdings',
                '424B': 'Prospectus',
                'DEF 14A': 'Proxy Statement'
            }
        },
        checkForCatalysts: (filing) => {
            const catalysts = [];
            const formType = filing.formType;
            
            // 8-K filings often contain major announcements
            if (formType.includes('8-K')) {
                catalysts.push('Material Event Filing');
            }
            // S-1 for IPOs
            if (formType.includes('S-1')) {
                catalysts.push('IPO Registration');
            }
            // 13D for major ownership changes
            if (formType.includes('13D')) {
                catalysts.push('Major Ownership Change');
            }
            // 424B for offerings
            if (formType.includes('424B')) {
                catalysts.push('Securities Offering');
            }
            
            return catalysts;
        }
    },
    
    // 4. StockTwits (Free API with limits)
    stocktwits: {
        name: 'StockTwits',
        endpoint: (symbol) => `https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`,
        trending: 'https://api.stocktwits.com/api/2/trending/symbols.json',
        parser: (data) => {
            if (data.messages) {
                return data.messages.map(msg => ({
                    body: msg.body,
                    sentiment: msg.entities.sentiment ? msg.entities.sentiment.basic : 'neutral',
                    likes: msg.likes.total,
                    created: msg.created_at,
                    symbols: msg.symbols.map(s => s.symbol)
                }));
            }
            return [];
        }
    },
    
    // 5. News Aggregators (May require scraping)
    aggregators: {
        benzinga: {
            name: 'Benzinga',
            movers: 'https://www.benzinga.com/movers',
            news: 'https://www.benzinga.com/news'
        },
        finviz: {
            name: 'Finviz',
            news: 'https://finviz.com/news.ashx',
            screener: 'https://finviz.com/screener.ashx?v=111&f=sh_avgvol_o500,sh_price_u10,ta_change_u10'
        },
        marketwatch: {
            name: 'MarketWatch',
            breaking: 'https://www.marketwatch.com/latest-news'
        }
    },
    
    // 6. Social Media Monitoring
    socialMedia: {
        twitter: {
            // Monitor these accounts for breaking news
            accounts: [
                '@DeItaone', // Breaking news
                '@LiveSquawk', // Market news
                '@zerohedge', // Market news
                '@unusual_whales', // Options flow
                '@Fxhedgers', // Macro news
                '@FirstSquawk', // Breaking news
                '@BreakingMkts', // Breaking markets
                '@realwillmeade', // Stock picks
                '@Mr_Derivatives' // Options flow
            ]
        }
    },
    
    // 7. Alternative Data Sources
    alternative: {
        googleTrends: {
            name: 'Google Trends',
            // Track search volume spikes for tickers
            checkTrend: async (symbol) => {
                // Would need Google Trends API or scraping
                // Spike in searches often precedes moves
            }
        },
        wikipedia: {
            // Recent edits to company pages can signal news
            recentChanges: 'https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcnamespace=0&rclimit=50&format=json'
        }
    }
};

// Aggregate news from multiple sources
async function aggregateNews(symbol = null) {
    const allNews = [];
    const errors = [];
    
    console.log(`📰 Aggregating news${symbol ? ' for ' + symbol : ''}...`);
    
    // 1. Reddit sentiment
    try {
        console.log('  Checking Reddit...');
        const wsbResponse = await axios.get(NEWS_SOURCES.reddit.endpoints.wsb, {
            headers: { 'User-Agent': 'RocketScanner/1.0' }
        });
        const posts = NEWS_SOURCES.reddit.parser(wsbResponse.data);
        
        if (symbol) {
            const relevantPosts = posts.filter(p => p.tickers.includes(symbol));
            allNews.push(...relevantPosts.map(p => ({
                source: 'Reddit WSB',
                title: p.title,
                score: p.score,
                url: p.url,
                timestamp: p.created,
                type: 'social'
            })));
        } else {
            // Get trending tickers
            const tickerMentions = {};
            posts.forEach(p => {
                p.tickers.forEach(t => {
                    tickerMentions[t] = (tickerMentions[t] || 0) + p.score;
                });
            });
            
            Object.entries(tickerMentions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach(([ticker, score]) => {
                    allNews.push({
                        source: 'Reddit Trending',
                        symbol: ticker,
                        score: score,
                        type: 'social_trend'
                    });
                });
        }
    } catch (error) {
        errors.push(`Reddit: ${error.message}`);
    }
    
    // 2. StockTwits sentiment
    try {
        if (symbol) {
            console.log('  Checking StockTwits...');
            const stResponse = await axios.get(NEWS_SOURCES.stocktwits.endpoint(symbol));
            const messages = NEWS_SOURCES.stocktwits.parser(stResponse.data);
            
            // Calculate sentiment
            const bullish = messages.filter(m => m.sentiment === 'Bullish').length;
            const bearish = messages.filter(m => m.sentiment === 'Bearish').length;
            
            if (messages.length > 0) {
                allNews.push({
                    source: 'StockTwits',
                    symbol: symbol,
                    sentiment: bullish > bearish ? 'Bullish' : bearish > bullish ? 'Bearish' : 'Neutral',
                    ratio: `${bullish}/${bearish}`,
                    volume: messages.length,
                    type: 'sentiment'
                });
            }
        } else {
            // Get trending symbols
            const trendingResponse = await axios.get(NEWS_SOURCES.stocktwits.trending);
            if (trendingResponse.data.symbols) {
                trendingResponse.data.symbols.slice(0, 5).forEach(s => {
                    allNews.push({
                        source: 'StockTwits Trending',
                        symbol: s.symbol,
                        title: s.title,
                        watchlist_count: s.watchlist_count,
                        type: 'social_trend'
                    });
                });
            }
        }
    } catch (error) {
        errors.push(`StockTwits: ${error.message}`);
    }
    
    // 3. SEC Filings check
    if (symbol) {
        console.log('  Checking SEC filings...');
        // Would need to implement SEC EDGAR API search
        // For now, just show the concept
        allNews.push({
            source: 'SEC EDGAR',
            note: 'Check https://www.sec.gov/edgar/search/ for ' + symbol,
            type: 'filing'
        });
    }
    
    return { news: allNews, errors };
}

// Find stocks with news catalysts
async function findCatalystStocks() {
    console.log('🔍 Searching for catalyst stocks...\n');
    
    const catalysts = [];
    
    // Get Reddit trending
    const redditNews = await aggregateNews();
    
    // Get StockTwits trending
    try {
        const response = await axios.get(NEWS_SOURCES.stocktwits.trending);
        if (response.data.symbols) {
            response.data.symbols.slice(0, 10).forEach(s => {
                catalysts.push({
                    symbol: s.symbol,
                    source: 'StockTwits Trending',
                    watchlists: s.watchlist_count,
                    title: s.title
                });
            });
        }
    } catch (error) {
        console.log('StockTwits error:', error.message);
    }
    
    return catalysts;
}

// Monitor specific stock for all news
async function monitorStock(symbol) {
    console.log(`\n📊 Monitoring ${symbol} across all sources...\n`);
    
    const results = await aggregateNews(symbol);
    
    console.log(`Found ${results.news.length} news items:\n`);
    
    results.news.forEach(item => {
        console.log(`[${item.source}] ${item.type}`);
        if (item.title) console.log(`  Title: ${item.title}`);
        if (item.sentiment) console.log(`  Sentiment: ${item.sentiment} ${item.ratio || ''}`);
        if (item.score) console.log(`  Score: ${item.score}`);
        console.log('');
    });
    
    if (results.errors.length > 0) {
        console.log('Errors:', results.errors);
    }
}

// Test the system
async function test() {
    // Find trending stocks
    const catalysts = await findCatalystStocks();
    console.log('\n🚀 TOP CATALYST STOCKS:');
    catalysts.slice(0, 5).forEach(c => {
        console.log(`  ${c.symbol}: ${c.source} - ${c.title || c.watchlists + ' watching'}`);
    });
    
    // Monitor specific stock
    if (catalysts.length > 0) {
        await monitorStock(catalysts[0].symbol);
    }
}

// Export for use in main server
module.exports = {
    aggregateNews,
    findCatalystStocks,
    monitorStock
};

// Run test if called directly
if (require.main === module) {
    test().catch(console.error);
}