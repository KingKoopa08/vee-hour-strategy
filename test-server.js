const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

// Test data
let testData = {
  AAPL: { price: 175.50, volume: 75000000, change: 2.5, name: 'Apple Inc.' },
  TSLA: { price: 245.30, volume: 95000000, change: -1.2, name: 'Tesla Inc.' },
  NVDA: { price: 455.60, volume: 45000000, change: 3.8, name: 'NVIDIA Corporation' },
  AMD: { price: 105.20, volume: 55000000, change: -0.5, name: 'Advanced Micro Devices' },
  SPY: { price: 445.80, volume: 85000000, change: 0.8, name: 'SPDR S&P 500 ETF' }
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API endpoints
app.get('/api/stocks/top-volume', (req, res) => {
  const stocks = Object.keys(testData).map((symbol, index) => {
    const basePrice = testData[symbol].price;
    const changePercent = testData[symbol].change;
    return {
      rank: index + 1,
      symbol: symbol,
      companyName: testData[symbol].name,
      price: basePrice,
      priceChange: basePrice * changePercent / 100,
      priceChangePercent: changePercent,
      volume: Math.floor(Math.random() * 10000000) + 1000000,
      volumeRatio: 1.2 + Math.random(),
      vwap: basePrice * 0.99,
      momentum: Math.random() > 0.5 ? 'bullish' : 'bearish',
      volumeSurge: Math.random() > 0.7,
      signal: Math.random() > 0.5 ? 'BUY' : Math.random() > 0.5 ? 'SELL' : 'HOLD',
      news: Math.random() > 0.5 ? {
        count: Math.floor(Math.random() * 5) + 1,
        latestTitle: 'Test News: Stock Shows Strong Pre-Market Movement',
        latestTime: new Date(Date.now() - Math.random() * 3600000).toISOString()
      } : null,
      updateTime: new Date().toLocaleTimeString('en-US'),
      mnavScore: 50 + Math.random() * 50  // Random score between 50-100
    };
  });
  res.json({ 
    success: true, 
    stocks: stocks,
    updateTime: new Date().toLocaleTimeString('en-US')
  });
});

app.get('/api/stocks/:symbol/snapshot', (req, res) => {
  const { symbol } = req.params;
  const data = testData[symbol.toUpperCase()];
  if (data) {
    res.json({ 
      success: true, 
      data: {
        symbol: symbol.toUpperCase(),
        price: data.price,
        change: data.change,
        changePercent: data.change,
        volume: data.volume,
        marketCap: 1000000000,
        peRatio: 25,
        week52High: data.price * 1.2,
        week52Low: data.price * 0.8
      }
    });
  } else {
    res.status(404).json({ success: false, error: 'Symbol not found' });
  }
});

app.get('/api/stocks/:symbol/indicators', (req, res) => {
  const { symbol } = req.params;
  const data = testData[symbol.toUpperCase()];
  if (data) {
    res.json({
      success: true,
      data: {
        vwap: data.price * 0.99,
        rsi: 45 + Math.random() * 30,
        bollingerBands: {
          upper: data.price * 1.02,
          middle: data.price,
          lower: data.price * 0.98
        },
        sma20: data.price * 0.995,
        ema9: data.price * 1.001,
        volumeRatio: 1.2 + Math.random(),
        priceChangePercent: data.change
      }
    });
  } else {
    res.status(404).json({ success: false, error: 'No indicators available' });
  }
});

app.get('/api/stocks/:symbol/signals', (req, res) => {
  const { symbol } = req.params;
  res.json({
    success: true,
    data: [
      {
        type: 'BUY',
        strength: 'MODERATE',
        symbol: symbol.toUpperCase(),
        price: testData[symbol.toUpperCase()]?.price || 100,
        timestamp: new Date(),
        reason: 'Test signal - Price below VWAP with increasing volume',
        confidence: 75,
        targetPrice: (testData[symbol.toUpperCase()]?.price || 100) * 1.03,
        stopLoss: (testData[symbol.toUpperCase()]?.price || 100) * 0.98,
        timeWindow: '6:05-6:35 AM MT',
        indicators: {
          vwap: 99,
          rsi: 45,
          volumeRatio: 1.5,
          priceVsVWAP: -1.2
        }
      }
    ]
  });
});

app.get('/api/market/status', (req, res) => {
  const now = new Date();
  const hour = now.getHours();
  const status = (hour >= 9 && hour < 16) ? 'open' : 'closed';
  res.json({ success: true, data: { status } });
});

app.get('/api/stocks/:symbol/safety', (req, res) => {
  res.json({
    success: true,
    data: {
      marketCapScore: 8,
      peRatioScore: 7,
      volumeScore: 9,
      technicalScore: 6,
      newsScore: 7,
      overallScore: 7.4,
      recommendation: 'SAFE'
    }
  });
});

// Start HTTP server
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ Test backend server running on http://localhost:${PORT}`);
  console.log('📝 This is a TEST server with mock data');
  console.log('🔌 API endpoints available:');
  console.log('   - GET /health');
  console.log('   - GET /api/stocks/top-volume');
  console.log('   - GET /api/stocks/:symbol/snapshot');
  console.log('   - GET /api/stocks/:symbol/indicators');
  console.log('   - GET /api/stocks/:symbol/signals');
  console.log('   - GET /api/market/status');
});

// WebSocket server
const WS_PORT = 3003;
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
  console.log('📡 WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received:', data);
      
      if (data.type === 'subscribe') {
        // Send fake price updates every 2 seconds
        const interval = setInterval(() => {
          const symbol = data.payload.symbols[0];
          const stockData = testData[symbol];
          if (stockData) {
            ws.send(JSON.stringify({
              type: 'priceUpdate',
              data: {
                symbol,
                price: stockData.price + (Math.random() - 0.5) * 2,
                volume: stockData.volume + Math.floor(Math.random() * 100000),
                indicators: {
                  vwap: stockData.price * 0.99,
                  rsi: 45 + Math.random() * 30,
                  volumeRatio: 1.2 + Math.random(),
                  priceChangePercent: stockData.change
                }
              },
              timestamp: new Date().toISOString()
            }));
          }
        }, 2000);
        
        ws.on('close', () => {
          clearInterval(interval);
        });
      }
    } catch (error) {
      console.error('WebSocket error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('📡 WebSocket client disconnected');
  });
});

console.log(`📡 WebSocket server running on ws://localhost:${WS_PORT}`);