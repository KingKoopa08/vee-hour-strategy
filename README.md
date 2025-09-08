# Trading Analysis Platform

A comprehensive pre-market trading analysis platform implementing the VEE/HOUR/ISPC strategy with real-time data from Polygon.io.

## Features

- **Real-time Market Data**: Live price feeds via Polygon.io WebSocket
- **Technical Indicators**: VWAP, RSI, Bollinger Bands, SMA, EMA
- **Time-Based Analysis**: Critical pre-market windows (6:05 AM, 6:35 AM, 7:55 AM MT)
- **Safety Scoring**: Algorithmic assessment of stock safety
- **Signal Generation**: Automated buy/sell/warning signals
- **Interactive Charts**: Real-time candlestick charts with indicators
- **Volume Analysis**: Pre-market volume comparison and tracking

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Polygon.io API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd PreMarket_Strategy
```

2. Create environment file:
```bash
cp .env.example .env
# Edit .env and add your Polygon.io API key
```

3. Start the application:
```bash
docker-compose up --build
```

4. Access the application:
- Frontend: http://localhost:3010
- Backend API: http://localhost:3001
- WebSocket: ws://localhost:3002

## Critical Trading Windows (Mountain Time)

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