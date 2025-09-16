# 🔔 Market Open Improvements Needed

## Current Behavior
At 9:30 AM ET, the scanner switches from pre-market to regular hours data automatically but has several issues.

## Problems at Market Open

### 1. **Gap Detection Missing**
- No tracking of gap up/down from pre-market close to market open
- Missing critical entry opportunities
- **Fix**: Compare pre-market close to opening price

### 2. **Price History Reset**
- All momentum data lost at market transition
- Shows "(no history)" for first few minutes
- **Fix**: Carry over last 10 minutes of pre-market history

### 3. **Opening Volume Spikes**
- Normal opening volume triggers false rocket alerts
- Every stock shows massive "volume acceleration"
- **Fix**: Separate opening volume from intraday spikes

### 4. **Opening Range Breakouts**
- No tracking of first 5-minute range
- Missing breakout entries (ORB strategy)
- **Fix**: Track and alert on opening range breaks

## Recommended Solution

### Add Market Open Handler
```javascript
function handleMarketOpen() {
    // 1. Save pre-market closing prices
    const preMarketClose = new Map();
    for (const [symbol, history] of priceHistory) {
        const lastPrice = history[history.length - 1];
        preMarketClose.set(symbol, lastPrice.value);
    }
    
    // 2. Calculate gaps when market opens
    setTimeout(() => {
        for (const [symbol, pmClose] of preMarketClose) {
            const openPrice = getCurrentPrice(symbol);
            const gapPercent = ((openPrice - pmClose) / pmClose) * 100;
            
            if (Math.abs(gapPercent) > 2) {
                sendGapAlert(symbol, gapPercent);
            }
        }
    }, 30000); // Check 30 seconds after open
    
    // 3. Track opening range (first 5 minutes)
    trackOpeningRange();
}
```

### Add Gap Scanner
```javascript
function scanForGaps() {
    const gappers = [];
    
    // Get pre-market close and regular open
    for (const stock of topStocks) {
        const gap = calculateGap(stock);
        if (gap.percent > 3) {
            gappers.push({
                ...stock,
                gapType: gap.percent > 0 ? 'GAP_UP' : 'GAP_DOWN',
                gapPercent: gap.percent,
                alert: gap.percent > 5 ? 'HIGH_PRIORITY' : 'WATCH'
            });
        }
    }
    
    return gappers;
}
```

### Add Opening Range Breakout Detection
```javascript
const openingRanges = new Map();

function trackOpeningRange() {
    // At 9:35 AM, lock in the 5-minute range
    setTimeout(() => {
        for (const [symbol, history] of priceHistory) {
            const last5Min = history.filter(p => 
                p.time > Date.now() - 300000
            );
            
            if (last5Min.length > 0) {
                const high = Math.max(...last5Min.map(p => p.value));
                const low = Math.min(...last5Min.map(p => p.value));
                
                openingRanges.set(symbol, { high, low });
            }
        }
    }, 300000); // 5 minutes after open
}

function checkORBreakout(symbol, price) {
    const range = openingRanges.get(symbol);
    if (!range) return null;
    
    if (price > range.high) {
        return { type: 'BREAKOUT_UP', level: range.high };
    } else if (price < range.low) {
        return { type: 'BREAKDOWN', level: range.low };
    }
    
    return null;
}
```

## Discord Alerts to Add

### 1. **Gap Alert** (9:30 AM)
```
🔔 GAP UP: AAPL +4.2%
Pre-market close: $180.50
Market open: $188.10
Volume: 2.5M shares
```

### 2. **Opening Range Alert** (9:35 AM)
```
📊 Opening Range Set: TSLA
High: $245.80
Low: $242.30
Current: $244.10
Watch for breakout!
```

### 3. **ORB Breakout Alert**
```
🚨 ORB BREAKOUT: NVDA
Broke above: $480.50
Current: $481.75
Volume: Increasing
```

## Priority Implementation

1. **Gap Scanner** - Most important for day traders
2. **Preserve History** - Keep momentum through transition
3. **ORB Detection** - Popular strategy worth supporting
4. **Volume Normalization** - Reduce false positives

## Testing

Test between 9:25-9:35 AM ET to ensure:
- Pre-market data captured correctly
- Smooth transition at 9:30
- Gap calculations accurate
- No duplicate alerts
- Opening range tracked properly