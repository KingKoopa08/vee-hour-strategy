import { PriceData } from './polygon.service';

interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

interface TechnicalIndicators {
  vwap: number;
  rsi: number;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  sma20: number;
  ema9: number;
  volumeRatio: number;
  priceChangePercent: number;
}

export class TechnicalAnalysisService {
  private static instance: TechnicalAnalysisService;
  private priceHistory: Map<string, OHLCV[]> = new Map();
  private indicators: Map<string, TechnicalIndicators> = new Map();
  private maxHistoryLength = 500;

  private constructor() {}

  static getInstance(): TechnicalAnalysisService {
    if (!TechnicalAnalysisService.instance) {
      TechnicalAnalysisService.instance = new TechnicalAnalysisService();
    }
    return TechnicalAnalysisService.instance;
  }

  updateIndicators(data: PriceData): TechnicalIndicators {
    const symbol = data.symbol;
    
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }

    const history = this.priceHistory.get(symbol)!;
    
    history.push({
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
      volume: data.volume,
      timestamp: data.timestamp
    });

    if (history.length > this.maxHistoryLength) {
      history.shift();
    }

    const indicators = this.calculateAllIndicators(symbol, history);
    this.indicators.set(symbol, indicators);
    
    return indicators;
  }

  private calculateAllIndicators(_symbol: string, history: OHLCV[]): TechnicalIndicators {
    if (history.length < 20) {
      return this.getDefaultIndicators();
    }

    const vwap = this.calculateVWAP(history);
    const rsi = this.calculateRSI(history, 14);
    const bollingerBands = this.calculateBollingerBands(history, 20, 2);
    const sma20 = this.calculateSMA(history.map(h => h.close), 20);
    const ema9 = this.calculateEMA(history.map(h => h.close), 9);
    const volumeRatio = this.calculateVolumeRatio(history);
    const priceChangePercent = this.calculatePriceChange(history);

    return {
      vwap,
      rsi,
      bollingerBands,
      sma20,
      ema9,
      volumeRatio,
      priceChangePercent
    };
  }

  calculateVWAP(history: OHLCV[]): number {
    const todayHistory = this.filterTodayData(history);
    
    if (todayHistory.length === 0) {
      return history[history.length - 1].close;
    }

    let cumulativeTPV = 0;
    let cumulativeVolume = 0;

    for (const candle of todayHistory) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      cumulativeTPV += typicalPrice * candle.volume;
      cumulativeVolume += candle.volume;
    }

    return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : todayHistory[todayHistory.length - 1].close;
  }

  calculateRSI(history: OHLCV[], period: number = 14): number {
    if (history.length < period + 1) {
      return 50;
    }

    const prices = history.map(h => h.close);
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < prices.length; i++) {
      const difference = prices[i] - prices[i - 1];
      gains.push(difference > 0 ? difference : 0);
      losses.push(difference < 0 ? Math.abs(difference) : 0);
    }

    const recentGains = gains.slice(-period);
    const recentLosses = losses.slice(-period);

    const avgGain = recentGains.reduce((a, b) => a + b, 0) / period;
    const avgLoss = recentLosses.reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) {
      return 100;
    }

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateBollingerBands(history: OHLCV[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number } {
    if (history.length < period) {
      const lastPrice = history[history.length - 1].close;
      return { upper: lastPrice, middle: lastPrice, lower: lastPrice };
    }

    const prices = history.slice(-period).map(h => h.close);
    const sma = this.calculateSMA(prices, period);
    const standardDeviation = this.calculateStandardDeviation(prices, sma);

    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev)
    };
  }

  calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) {
      return prices[prices.length - 1];
    }

    const relevantPrices = prices.slice(-period);
    return relevantPrices.reduce((a, b) => a + b, 0) / period;
  }

  calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) {
      return prices[prices.length - 1];
    }

    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(prices.slice(0, period), period);

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  private calculateStandardDeviation(prices: number[], mean: number): number {
    const squaredDifferences = prices.map(price => Math.pow(price - mean, 2));
    const variance = squaredDifferences.reduce((a, b) => a + b, 0) / prices.length;
    return Math.sqrt(variance);
  }

  private calculateVolumeRatio(history: OHLCV[]): number {
    if (history.length < 20) {
      return 1;
    }

    const currentVolume = history[history.length - 1].volume;
    const avgVolume = history.slice(-20).reduce((sum, h) => sum + h.volume, 0) / 20;
    
    return avgVolume > 0 ? currentVolume / avgVolume : 1;
  }

  private calculatePriceChange(history: OHLCV[]): number {
    if (history.length < 2) {
      return 0;
    }

    const currentPrice = history[history.length - 1].close;
    const previousPrice = history[0].close;
    
    return ((currentPrice - previousPrice) / previousPrice) * 100;
  }

  private filterTodayData(history: OHLCV[]): OHLCV[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return history.filter(h => h.timestamp >= today);
  }

  getIndicators(symbol: string): TechnicalIndicators | null {
    return this.indicators.get(symbol) || null;
  }

  private getDefaultIndicators(): TechnicalIndicators {
    return {
      vwap: 0,
      rsi: 50,
      bollingerBands: { upper: 0, middle: 0, lower: 0 },
      sma20: 0,
      ema9: 0,
      volumeRatio: 1,
      priceChangePercent: 0
    };
  }

  isOverbought(symbol: string): boolean {
    const indicators = this.getIndicators(symbol);
    return indicators ? indicators.rsi > 70 : false;
  }

  isOversold(symbol: string): boolean {
    const indicators = this.getIndicators(symbol);
    return indicators ? indicators.rsi < 30 : false;
  }

  isPriceAboveVWAP(symbol: string, currentPrice: number): boolean {
    const indicators = this.getIndicators(symbol);
    return indicators ? currentPrice > indicators.vwap : false;
  }

  isPriceBelowVWAP(symbol: string, currentPrice: number): boolean {
    const indicators = this.getIndicators(symbol);
    return indicators ? currentPrice < indicators.vwap : false;
  }
}