# 📈 PreMarket Strategy - Real-Time Market Scanner

A high-performance market scanner and trading analysis platform that tracks top gainers, volume movers, and implements the VEE/HOUR/ISPC strategy using Polygon.io real-time data.

## 🚀 Features

### Market Scanner
- **Real-time Top Gainers** - Track stocks with highest daily gains
- **Volume Analysis** - Monitor unusual volume patterns and spikes
- **Price Change Tracking** - 30s, 1m, 2m, 3m, 5m price movements
- **WebSocket Updates** - Live data streaming without page refresh
- **Market Session Aware** - Pre-market, Regular Hours, After-hours tracking
- **Accurate Calculations** - Price changes calculated from actual prices

### Trading Platform
- **Technical Indicators**: VWAP, RSI, Bollinger Bands, SMA, EMA
- **Time-Based Analysis**: Critical pre-market windows (6:05 AM, 6:35 AM, 7:55 AM MT)
- **Safety Scoring**: Algorithmic assessment of stock safety
- **Signal Generation**: Automated buy/sell/warning signals
- **Interactive Charts**: Real-time candlestick charts with indicators

## 📊 Live Access

- **Production**: https://daily3club.com (Market Scanner)
- **Trading Platform**: http://15.204.86.6:3010
- **API Endpoint**: https://daily3club.com/api/gainers

## 🔧 Quick Start

### Prerequisites
- Node.js 18+
- PM2 (`npm install -g pm2`)
- Polygon.io API key (Current: KxOoBWACGCGE5QN_0zQPRNMHVwIRdiTV)
- Docker and Docker Compose (for trading platform)

### Installation - Market Scanner

1. Clone and setup:
```bash
git clone https://github.com/KingKoopa08/vee-hour-strategy.git
cd vee-hour-strategy
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your Polygon API key
```

3. Start the scanner:
```bash
# Development
node unified-scanner.js

# Production with PM2
pm2 start unified-scanner.js --name market-scanner
```

4. Access:
- Scanner: http://localhost:3050
- Volume Movers: http://localhost:3050/volume
- API: http://localhost:3050/api/gainers

### Installation - Trading Platform

```bash
# Using Docker Compose
docker-compose up --build

# Access at:
# Frontend: http://localhost:3010
# Backend: http://localhost:3001

## 📁 Project Structure

```
PreMarket_Strategy/
├── unified-scanner.js      # Market scanner server
├── volume-movers-page.html # Volume tracking interface
├── docker-compose.yml      # Trading platform containers
├── scripts/                # Deployment and setup scripts
│   ├── deploy.sh          # Production deployment
│   ├── setup-domain.sh    # Domain configuration
│   ├── setup-ssl.sh       # SSL certificate setup
│   ├── fix-routing.sh     # Fix routing issues
│   └── setup-both-apps.sh # Multi-app setup
├── TRAFFIC-ROUTING.md      # Nginx routing guide
├── DOMAIN-SETUP.md        # Domain configuration
└── README.md              # This file
```

## ⏰ Critical Trading Windows (Mountain Time)

- **5:00-6:00 AM**: Early volume analysis
- **6:05 AM**: Primary entry signal (KEY WINDOW)
- **6:10-6:35 AM**: Target sell window
- **6:35 AM**: Directional bias confirmation
- **7:00-7:10 AM**: Major player engagement
- **7:55 AM**: Common breakout time
- **8:40 AM**: Secondary rotation opportunity

## Trading Strategy

### 6:05 AM Entry Criteria
- Stock trending down from pre-market high
- Volume above average (1.2x+)
- Price below VWAP
- RSI not overbought (<70)
- Safety score > 6/10

### Exit Criteria
- Price crosses above VWAP
- RSI shows overbought (>70)
- 3% profit target reached
- Volume declining significantly

## Architecture

### Backend (Node.js/TypeScript)
- Express API server
- WebSocket server for real-time data
- PostgreSQL for historical data
- Redis for caching
- Polygon.io integration

### Frontend (Next.js/React)
- Real-time dashboard
- Interactive charts (lightweight-charts)
- WebSocket client
- Responsive design

### Services
- **PolygonService**: Market data integration
- **TechnicalAnalysisService**: Indicator calculations
- **SignalGeneratorService**: Trading signal generation
- **SafetyScoringService**: Risk assessment
- **WebSocketManager**: Real-time communication

## API Endpoints

### Stock Data
- `GET /api/stocks/top-volume` - Top volume stocks
- `GET /api/stocks/:symbol/snapshot` - Stock snapshot
- `GET /api/stocks/:symbol/indicators` - Technical indicators
- `GET /api/stocks/:symbol/signals` - Trading signals
- `GET /api/stocks/:symbol/safety` - Safety score

### Market Data
- `GET /api/market/status` - Market open/closed status
- `GET /api/scanner/safe-stocks` - Top safe stocks
- `GET /api/signals/all` - All recent signals

### Historical Data
- `GET /api/historical/:symbol` - Historical price data
- `GET /api/premarket/:symbol/volume` - Pre-market volume

## Development

### Backend Development
```bash
cd backend
npm install
npm run dev
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

### Database Migrations
```bash
docker-compose exec postgres psql -U trader -d trading_analysis
```

## Testing

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## Monitoring

- Health check: http://localhost:3001/health
- WebSocket connections: Monitor via backend logs
- Database: PostgreSQL on port 5432
- Cache: Redis on port 6379

## Safety Features

- Automated safety scoring (market cap, P/E ratio, volume, technical position, news sentiment)
- Risk level indicators (SAFE/MODERATE/RISKY)
- Stop loss recommendations
- Position sizing suggestions

## Disclaimer

**IMPORTANT**: This platform is for educational purposes only. It is not financial advice. Trading stocks involves substantial risk of loss. Always do your own research and consult with a qualified financial advisor before making any investment decisions.

## License

This project is for educational purposes only. Use at your own risk.