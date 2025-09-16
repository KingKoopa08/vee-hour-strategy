# Discord Webhook Setup for Rocket Scanner

## Step 1: Create Discord Webhook

1. **Open Discord** and go to your server
2. **Right-click on the channel** where you want alerts (e.g., #trading-alerts)
3. Select **Edit Channel** → **Integrations** → **Webhooks**
4. Click **Create Webhook**
5. Give it a name like "Rocket Scanner Bot"
6. **Copy the Webhook URL** - it looks like:
   ```
   https://discord.com/api/webhooks/123456789/abcdefghijk...
   ```

## Step 2: Configure in Rocket Scanner

1. Open http://localhost:3018/rocket-scanner.html
2. In the **Discord Integration** panel on the right
3. Paste your webhook URL in the input field
4. Click **Test Discord Alert** to verify it works

## Step 3: Create Multiple Alert Channels (Optional)

For different alert levels, create separate webhooks:

### Channel Structure:
```
📂 Trading Alerts
  ├── 🚨-jackpot-alerts    (Level 4 only)
  ├── 🔥-urgent-movers     (Level 3+)
  ├── ⚡-all-alerts        (All levels)
  └── 📰-news-feed         (Breaking news)
```

## Step 4: Test Your Setup

Run this test script to send a test alert:

```javascript
// test-discord.js
const axios = require('axios');

const WEBHOOK_URL = 'YOUR_WEBHOOK_URL_HERE';

async function sendTestAlert() {
    const alert = {
        embeds: [{
            title: '🚀 TEST ALERT: ROCKET DETECTED!',
            description: 'This is a test alert from your Rocket Scanner',
            color: 0xFF0000, // Red
            fields: [
                { name: 'Symbol', value: 'TEST', inline: true },
                { name: 'Price', value: '$10.50', inline: true },
                { name: 'Change', value: '+125.5%', inline: true },
                { name: 'Volume', value: '5.2M', inline: true },
                { name: 'Level', value: 'JACKPOT 🚀', inline: true },
                { name: 'RSI', value: '78.5', inline: true }
            ],
            footer: {
                text: 'Rocket Scanner Alert'
            },
            timestamp: new Date().toISOString()
        }]
    };
    
    try {
        await axios.post(WEBHOOK_URL, alert);
        console.log('✅ Discord alert sent successfully!');
    } catch (error) {
        console.error('❌ Failed to send Discord alert:', error.message);
    }
}

sendTestAlert();
```

## Alert Format Examples

### Level 4 - JACKPOT Alert
```
🚀 JACKPOT DETECTED: CHEK
━━━━━━━━━━━━━━━━━━━━
Price: $2.47 (+231.2%)
Volume: 129.6M (1000x avg)
VWAP: $2.15
RSI: 89.5
News: "Merger agreement announced"
Time: 5:32 AM ET
━━━━━━━━━━━━━━━━━━━━
⚠️ EXTREME VOLATILITY
```

### Level 3 - URGENT Alert
```
🔥 URGENT MOVER: ATYR
Price: $1.08 (+82.1%)
Volume: 155M
Entry above VWAP $0.95
```

### Level 2 - ALERT
```
⚡ VOLUME SPIKE: BITF
+15.7% on 171M volume
Watching for continuation
```

## Webhook Security

⚠️ **IMPORTANT**: 
- Never share your webhook URL publicly
- Store it in environment variables for production
- Rotate webhooks if compromised
- Set rate limits in Discord server settings

## Advanced Configuration

### Multiple Webhook Support
You can set up different webhooks for different alert levels:

```javascript
const WEBHOOKS = {
    jackpot: 'https://discord.com/api/webhooks/...', // Level 4 only
    urgent: 'https://discord.com/api/webhooks/...',  // Level 3+
    all: 'https://discord.com/api/webhooks/...',     // All alerts
    news: 'https://discord.com/api/webhooks/...'     // News only
};
```

### Custom Alert Sounds
In Discord, you can set different notification sounds for each channel:
- Right-click channel → Notification Settings
- Set to "All Messages" for critical channels
- Custom sound for JACKPOT alerts

## Testing Your Live Setup

1. The Rocket Scanner will automatically send alerts when it detects:
   - Stocks with >50% gains and >1M volume (Level 3)
   - Stocks with >100% gains and >5M volume (Level 4)
   - Major news catalysts

2. During market hours, expect alerts for:
   - Pre-market: 4:00 AM - 9:30 AM ET (most active)
   - Regular hours: 9:30 AM - 4:00 PM ET
   - After-hours: 4:00 PM - 8:00 PM ET

3. Alert frequency:
   - Scans every 30 seconds
   - Prevents duplicate alerts for same symbol
   - Clears alert cache every hour