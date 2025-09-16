# 📰 Complete News Sources for Rocket Scanner

## Currently Implemented
✅ **Polygon.io News API** - Real-time financial news (FREE with API key)

## Additional Free Sources to Add

### 1. 🔥 Reddit APIs (FREE - No Key Required)
- **r/wallstreetbets** - Retail trader sentiment
- **r/stocks** - General stock discussion  
- **r/pennystocks** - Small cap movers
- **r/Shortsqueeze** - Short squeeze candidates
- **r/SPACs** - SPAC announcements
- **API**: `https://www.reddit.com/r/{subreddit}/hot.json`

### 2. 📈 StockTwits (FREE with limits)
- **Trending Symbols** - Most discussed stocks
- **Symbol Streams** - Sentiment per stock
- **API**: `https://api.stocktwits.com/api/2/trending/symbols.json`

### 3. 📋 SEC EDGAR (FREE - Official)
- **8-K** - Material events (mergers, CEO changes)
- **S-1** - IPO registrations
- **13D/G** - Major ownership changes (>5%)
- **424B** - Securities offerings
- **API**: RSS feeds for real-time filings

### 4. 🌐 RSS Feeds (FREE)
```javascript
const RSS_FEEDS = {
    'MarketWatch': 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    'Seeking Alpha': 'https://seekingalpha.com/market_currents.xml',
    'Bloomberg': 'https://feeds.bloomberg.com/markets/news.rss',
    'CNBC': 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
    'Yahoo Finance': 'https://finance.yahoo.com/rss/topstories',
    'Reuters': 'https://www.reutersagency.com/feed/?best-sectors=commodities&post_type=best',
    'Benzinga': 'https://www.benzinga.com/rss.php',
    'InvestorPlace': 'https://investorplace.com/feed/'
}
```

### 5. 🐦 Twitter/X Accounts to Monitor
Key accounts that break news first:
- **@DeItaone** - Fastest breaking news
- **@LiveSquawk** - Market squawk service
- **@FirstSquawk** - Breaking news
- **@unusual_whales** - Options flow alerts
- **@zerohedge** - Market news
- **@BreakingMkts** - Breaking markets
- **@Fxhedgers** - Macro news
- **@TradeTheNews_** - Trade alerts

### 6. 📊 Alternative Data Sources

#### Google Trends API
- Search volume spikes often precede moves
- Track ticker searches in real-time

#### Wikipedia Recent Changes
- Company page edits can signal news
- API: `https://en.wikipedia.org/w/api.php`

#### GitHub Activity
- Tech company repo activity
- New releases/updates

### 7. 🎯 Specialized Financial Sites

#### Finviz
- News aggregator
- Screener for unusual activity
- URL: `https://finviz.com/news.ashx`

#### Benzinga Pro (Scraping)
- Movers section
- Breaking news
- URL: `https://www.benzinga.com/movers`

#### TradingView
- Ideas and analysis
- Screener API

### 8. 📢 Press Release Wires
- **PR Newswire** - `https://www.prnewswire.com/rss/`
- **Business Wire** - RSS feeds available
- **GlobeNewswire** - `https://www.globenewswire.com/RssFeed/`
- **Accesswire** - Company announcements

### 9. 🏢 Company-Specific Sources
- **Investor Relations Pages** - Direct from companies
- **8-K Filings** - Material events
- **Earnings Call Transcripts** - Via Seeking Alpha

### 10. 💬 Discord/Telegram Groups
- Trading communities
- Alert services
- Requires bot integration

## Implementation Priority

### Phase 1 (Immediate)
1. ✅ Polygon.io (done)
2. Reddit WSB/pennystocks
3. StockTwits trending
4. SEC 8-K filings

### Phase 2 (Next)
5. RSS feed aggregation
6. Twitter key accounts
7. PR Newswire feeds
8. Finviz scraping

### Phase 3 (Advanced)
9. Google Trends API
10. Wikipedia monitoring
11. Discord/Telegram bots
12. Custom NLP for sentiment

## News Catalyst Patterns to Detect

### 🚀 Rocket Triggers
- **Merger/Acquisition** - "announces merger", "to be acquired"
- **FDA Approval** - "FDA approves", "granted approval"
- **Contract Wins** - "awarded contract", "secures deal"
- **Earnings Beat** - "beats estimates", "record revenue"
- **Short Squeeze** - "high short interest", "squeeze"
- **Insider Buying** - "CEO buys", "insider purchase"
- **Analyst Upgrade** - "upgraded to buy", "price target raised"

### 🔥 Volume Triggers
- **Breaking News** - First 5 minutes after news
- **Social Momentum** - Reddit/Twitter trending
- **Options Flow** - Unusual options activity
- **Halt/Resume** - Trading halts for news

## API Rate Limits

| Source | Limit | Reset |
|--------|-------|-------|
| Polygon.io | 5 req/min (free) | Per minute |
| Reddit | 60 req/min | Per minute |
| StockTwits | 200 req/hour | Hourly |
| SEC EDGAR | Unlimited | - |
| RSS Feeds | Unlimited | - |
| Twitter API | 300 req/15min | 15 minutes |

## Integration Code Example

```javascript
async function aggregateAllNews(symbol) {
    const news = [];
    
    // 1. Polygon.io
    news.push(...await fetchPolygonNews(symbol));
    
    // 2. Reddit mentions
    news.push(...await fetchRedditMentions(symbol));
    
    // 3. StockTwits sentiment
    news.push(...await fetchStockTwits(symbol));
    
    // 4. SEC filings
    news.push(...await fetchSECFilings(symbol));
    
    // 5. RSS feeds
    news.push(...await fetchRSSNews(symbol));
    
    // Deduplicate and sort by relevance
    return deduplicateNews(news);
}
```

## Testing Endpoints

```bash
# Reddit
curl "https://www.reddit.com/r/wallstreetbets/hot.json?limit=5"

# StockTwits
curl "https://api.stocktwits.com/api/2/trending/symbols.json"

# SEC RSS
curl "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom"

# Yahoo Finance RSS
curl "https://finance.yahoo.com/rss/topstories"
```

## Notes
- Combine multiple sources for confirmation
- Earlier news = bigger moves
- Social sentiment leads price
- SEC filings are most reliable
- Twitter is fastest but needs filtering