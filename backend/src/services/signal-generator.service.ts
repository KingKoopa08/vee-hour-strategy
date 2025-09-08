import moment from 'moment-timezone';
import { PriceData } from './polygon.service';
import { TechnicalAnalysisService } from './technical-analysis.service';
import { SafetyScoringService } from './safety-scoring.service';
import { logger } from '../utils/logger';

export enum SignalType {
  BUY = 'BUY',
  SELL = 'SELL',
  HOLD = 'HOLD',
  WARNING = 'WARNING'
}

export enum SignalStrength {
  STRONG = 'STRONG',
  MODERATE = 'MODERATE',
  WEAK = 'WEAK'
}

export interface TradingSignal {
  type: SignalType;
  strength: SignalStrength;
  symbol: string;
  price: number;
  timestamp: Date;
  reason: string;
  confidence: number;
  targetPrice?: number;
  stopLoss?: number;
  timeWindow?: string;
  indicators: {
    vwap: number;
    rsi: number;
    volumeRatio: number;
    priceVsVWAP: number;
  };
}

interface TimeWindow {
  start: string;
  end: string;
  action: string;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class SignalGeneratorService {
  private static instance: SignalGeneratorService;
  private technicalAnalysis: TechnicalAnalysisService;
  private safetyScoring: SafetyScoringService;
  private signals: Map<string, TradingSignal[]> = new Map();
  private timezone = 'America/Denver';

  private criticalTimeWindows: TimeWindow[] = [
    { start: '05:00', end: '06:00', action: 'EARLY_VOLUME_ANALYSIS', importance: 'MEDIUM' },
    { start: '06:03', end: '06:07', action: 'PRIMARY_ENTRY', importance: 'HIGH' },
    { start: '06:10', end: '06:35', action: 'TARGET_SELL', importance: 'HIGH' },
    { start: '06:33', end: '06:37', action: 'DIRECTIONAL_BIAS', importance: 'HIGH' },
    { start: '07:00', end: '07:10', action: 'MAJOR_PLAYER_ENTRY', importance: 'MEDIUM' },
    { start: '07:30', end: '07:35', action: 'MARKET_OPEN_PREP', importance: 'HIGH' },
    { start: '07:53', end: '07:57', action: 'BREAKOUT_WINDOW', importance: 'HIGH' },
    { start: '08:38', end: '08:42', action: 'SECONDARY_ROTATION', importance: 'MEDIUM' }
  ];

  private constructor() {
    this.technicalAnalysis = TechnicalAnalysisService.getInstance();
    this.safetyScoring = SafetyScoringService.getInstance();
  }

  static getInstance(): SignalGeneratorService {
    if (!SignalGeneratorService.instance) {
      SignalGeneratorService.instance = new SignalGeneratorService();
    }
    return SignalGeneratorService.instance;
  }

  generateSignals(data: PriceData): TradingSignal | null {
    const currentTime = moment().tz(this.timezone);
    const timeWindow = this.getCurrentTimeWindow(currentTime);
    const indicators = this.technicalAnalysis.getIndicators(data.symbol);
    
    if (!indicators) {
      return null;
    }

    const safetyScore = this.safetyScoring.calculateScore(data.symbol);
    
    let signal: TradingSignal | null = null;

    if (timeWindow) {
      signal = this.generateTimeBasedSignal(data, indicators, timeWindow, safetyScore);
    } else {
      signal = this.generateTechnicalSignal(data, indicators, safetyScore);
    }

    if (signal) {
      this.storeSignal(signal);
      logger.info(`Signal generated for ${data.symbol}:`, signal);
    }

    return signal;
  }

  private generateTimeBasedSignal(
    data: PriceData,
    indicators: any,
    timeWindow: TimeWindow,
    safetyScore: number
  ): TradingSignal | null {
    const priceVsVWAP = ((data.price - indicators.vwap) / indicators.vwap) * 100;

    switch (timeWindow.action) {
      case 'PRIMARY_ENTRY':
        return this.generate605Signal(data, indicators, safetyScore, priceVsVWAP);
      
      case 'TARGET_SELL':
        return this.generateSellSignal(data, indicators, priceVsVWAP);
      
      case 'DIRECTIONAL_BIAS':
        return this.generateDirectionalBiasSignal(data, indicators, priceVsVWAP);
      
      case 'BREAKOUT_WINDOW':
        return this.generateBreakoutSignal(data, indicators, safetyScore, priceVsVWAP);
      
      default:
        return this.generateStandardSignal(data, indicators, safetyScore, priceVsVWAP);
    }
  }

  private generate605Signal(
    data: PriceData,
    indicators: any,
    safetyScore: number,
    priceVsVWAP: number
  ): TradingSignal | null {
    const isTrendingDown = indicators.priceChangePercent < -0.5;
    const hasGoodVolume = indicators.volumeRatio > 1.2;
    const isBelowVWAP = priceVsVWAP < -0.5;
    const isNotOverbought = indicators.rsi < 70;
    const isSafe = safetyScore > 6;

    if (isTrendingDown && hasGoodVolume && isBelowVWAP && isNotOverbought && isSafe) {
      return {
        type: SignalType.BUY,
        strength: SignalStrength.STRONG,
        symbol: data.symbol,
        price: data.price,
        timestamp: new Date(),
        reason: '6:05 AM Entry Signal: Stock trending down with good volume, below VWAP',
        confidence: Math.min(90, safetyScore * 10),
        targetPrice: data.price * 1.03,
        stopLoss: data.price * 0.98,
        timeWindow: '6:05-6:35 AM MT',
        indicators: {
          vwap: indicators.vwap,
          rsi: indicators.rsi,
          volumeRatio: indicators.volumeRatio,
          priceVsVWAP: priceVsVWAP
        }
      };
    }

    if (!isTrendingDown && priceVsVWAP > 1) {
      return {
        type: SignalType.WARNING,
        strength: SignalStrength.STRONG,
        symbol: data.symbol,
        price: data.price,
        timestamp: new Date(),
        reason: '6:05 AM Warning: Stock trending up, potential top',
        confidence: 80,
        indicators: {
          vwap: indicators.vwap,
          rsi: indicators.rsi,
          volumeRatio: indicators.volumeRatio,
          priceVsVWAP: priceVsVWAP
        }
      };
    }

    return null;
  }

  private generateSellSignal(
    data: PriceData,
    indicators: any,
    priceVsVWAP: number
  ): TradingSignal | null {
    const hasPosition = this.checkIfHasPosition(data.symbol);
    
    if (!hasPosition) {
      return null;
    }

    const isAboveVWAP = priceVsVWAP > 0.5;
    const isOverbought = indicators.rsi > 70;
    const profitTarget = this.calculateProfit(data.symbol, data.price) > 3;

    if (isAboveVWAP || isOverbought || profitTarget) {
      return {
        type: SignalType.SELL,
        strength: profitTarget ? SignalStrength.STRONG : SignalStrength.MODERATE,
        symbol: data.symbol,
        price: data.price,
        timestamp: new Date(),
        reason: `Sell signal: ${profitTarget ? 'Profit target reached' : isOverbought ? 'RSI overbought' : 'Price above VWAP'}`,
        confidence: 85,
        timeWindow: '6:10-6:35 AM MT',
        indicators: {
          vwap: indicators.vwap,
          rsi: indicators.rsi,
          volumeRatio: indicators.volumeRatio,
          priceVsVWAP: priceVsVWAP
        }
      };
    }

    return null;
  }

  private generateDirectionalBiasSignal(
    data: PriceData,
    indicators: any,
    priceVsVWAP: number
  ): TradingSignal | null {
    const trendStrength = Math.abs(indicators.priceChangePercent);
    const volumeConfirmation = indicators.volumeRatio > 1.5;

    if (trendStrength > 1 && volumeConfirmation) {
      const direction = indicators.priceChangePercent > 0 ? 'BULLISH' : 'BEARISH';
      
      return {
        type: SignalType.HOLD,
        strength: SignalStrength.MODERATE,
        symbol: data.symbol,
        price: data.price,
        timestamp: new Date(),
        reason: `6:35 AM Directional Bias: ${direction} trend confirmed`,
        confidence: 75,
        timeWindow: '6:35 AM MT',
        indicators: {
          vwap: indicators.vwap,
          rsi: indicators.rsi,
          volumeRatio: indicators.volumeRatio,
          priceVsVWAP: priceVsVWAP
        }
      };
    }

    return null;
  }

  private generateBreakoutSignal(
    data: PriceData,
    indicators: any,
    safetyScore: number,
    priceVsVWAP: number
  ): TradingSignal | null {
    const isBreakingOut = this.detectBreakout(data, indicators);
    const hasVolume = indicators.volumeRatio > 2;
    const isSafe = safetyScore > 7;

    if (isBreakingOut && hasVolume && isSafe) {
      return {
        type: SignalType.BUY,
        strength: SignalStrength.MODERATE,
        symbol: data.symbol,
        price: data.price,
        timestamp: new Date(),
        reason: '7:55 AM Breakout detected with strong volume',
        confidence: 70,
        targetPrice: data.price * 1.02,
        stopLoss: data.price * 0.99,
        timeWindow: '7:55 AM MT',
        indicators: {
          vwap: indicators.vwap,
          rsi: indicators.rsi,
          volumeRatio: indicators.volumeRatio,
          priceVsVWAP: priceVsVWAP
        }
      };
    }

    return null;
  }

  private generateTechnicalSignal(
    data: PriceData,
    indicators: any,
    safetyScore: number
  ): TradingSignal | null {
    const priceVsVWAP = ((data.price - indicators.vwap) / indicators.vwap) * 100;
    
    if (indicators.rsi < 30 && priceVsVWAP < -2 && indicators.volumeRatio > 1.5 && safetyScore > 6) {
      return {
        type: SignalType.BUY,
        strength: SignalStrength.MODERATE,
        symbol: data.symbol,
        price: data.price,
        timestamp: new Date(),
        reason: 'Oversold conditions with high volume',
        confidence: 65,
        targetPrice: data.price * 1.02,
        stopLoss: data.price * 0.98,
        indicators: {
          vwap: indicators.vwap,
          rsi: indicators.rsi,
          volumeRatio: indicators.volumeRatio,
          priceVsVWAP: priceVsVWAP
        }
      };
    }

    if (indicators.rsi > 80 && priceVsVWAP > 3) {
      return {
        type: SignalType.WARNING,
        strength: SignalStrength.MODERATE,
        symbol: data.symbol,
        price: data.price,
        timestamp: new Date(),
        reason: 'Extremely overbought conditions',
        confidence: 70,
        indicators: {
          vwap: indicators.vwap,
          rsi: indicators.rsi,
          volumeRatio: indicators.volumeRatio,
          priceVsVWAP: priceVsVWAP
        }
      };
    }

    return null;
  }

  private generateStandardSignal(
    data: PriceData,
    indicators: any,
    safetyScore: number,
    _priceVsVWAP: number
  ): TradingSignal | null {
    return this.generateTechnicalSignal(data, indicators, safetyScore);
  }

  private getCurrentTimeWindow(currentTime: moment.Moment): TimeWindow | null {
    const currentTimeStr = currentTime.format('HH:mm');
    
    for (const window of this.criticalTimeWindows) {
      if (currentTimeStr >= window.start && currentTimeStr <= window.end) {
        return window;
      }
    }
    
    return null;
  }

  private detectBreakout(data: PriceData, indicators: any): boolean {
    const priceAboveBollingerUpper = data.price > indicators.bollingerBands.upper;
    const volumeSurge = indicators.volumeRatio > 2;
    const momentum = indicators.ema9 > indicators.sma20;
    
    return priceAboveBollingerUpper && volumeSurge && momentum;
  }

  private checkIfHasPosition(symbol: string): boolean {
    const signals = this.signals.get(symbol) || [];
    const recentBuys = signals.filter(s => 
      s.type === SignalType.BUY && 
      (Date.now() - s.timestamp.getTime()) < 3600000
    );
    const recentSells = signals.filter(s => 
      s.type === SignalType.SELL && 
      (Date.now() - s.timestamp.getTime()) < 3600000
    );
    
    return recentBuys.length > recentSells.length;
  }

  private calculateProfit(symbol: string, currentPrice: number): number {
    const signals = this.signals.get(symbol) || [];
    const lastBuy = signals.filter(s => s.type === SignalType.BUY).pop();
    
    if (!lastBuy) {
      return 0;
    }
    
    return ((currentPrice - lastBuy.price) / lastBuy.price) * 100;
  }

  private storeSignal(signal: TradingSignal): void {
    if (!this.signals.has(signal.symbol)) {
      this.signals.set(signal.symbol, []);
    }
    
    const symbolSignals = this.signals.get(signal.symbol)!;
    symbolSignals.push(signal);
    
    if (symbolSignals.length > 100) {
      symbolSignals.shift();
    }
  }

  getRecentSignals(symbol?: string): TradingSignal[] {
    if (symbol) {
      return this.signals.get(symbol) || [];
    }
    
    const allSignals: TradingSignal[] = [];
    this.signals.forEach(signals => allSignals.push(...signals));
    
    return allSignals
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 50);
  }
}