# Polygon.io API Key Setup

## Getting Your Free API Key

1. **Sign up for Polygon.io:**
   - Go to https://polygon.io/
   - Click "Get your Free API Key"
   - Sign up with email or Google/GitHub
   - Verify your email

2. **Get your API key:**
   - Login to https://polygon.io/dashboard
   - Your API key will be displayed
   - Copy it (looks like: `abc123XYZ456...`)

## Free Tier Limits
- 5 API calls per minute
- End-of-day data only
- Limited to stocks data

## Paid Plans (if needed)
- **Starter ($29/month):** Unlimited API calls, real-time data
- **Developer ($99/month):** WebSocket streaming, more data
- **Advanced ($199/month):** Full historical data

## Configure Your Application

### For Local Development:
Create a `.env` file in your project directory:
```bash
POLYGON_API_KEY=your_polygon_api_key_here
NODE_ENV=development
PORT=3011
WS_PORT=3006
```

### For Docker Deployment:
The `.env` file will be used by docker-compose automatically.

### Test Your API Key:
```bash
# Test API key with curl
curl "https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=YOUR_API_KEY"

# Or test with the application
node premarket-server.js
```

## Important Notes
- **NEVER** commit your API key to Git
- The `.env` file is in `.gitignore` for security
- Use `.env.example` as a template
- For production, consider using environment variables or secrets management

## Troubleshooting

If you see "API key invalid" errors:
1. Check for typos in the key
2. Ensure no extra spaces or quotes
3. Verify key is active on Polygon dashboard
4. Check if you've exceeded rate limits

## Rate Limit Handling
The application automatically handles rate limits by:
- Batching requests when possible
- Implementing retry logic with delays
- Caching responses to reduce API calls