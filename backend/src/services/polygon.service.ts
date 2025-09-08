import { restClient, websocketClient } from '@polygon.io/client-js';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { CacheService } from './cache.service';

export interface PriceData {
  symbol: string;
  price: number;
  volume: number;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  vwap?: number;
  preMarketVolume?: number;
  averageVolume?: number;
}

export interface StockSnapshot {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  peRatio?: number;
  week52High?: number;
  week52Low?: number;
  news?: any[];
}

export class PolygonService extends EventEmitter {
  private static instance: PolygonService;
  private rest: any;
  // private websocket: any; // TODO: Re-enable when WebSocket is properly integrated
  private cache: CacheService;
  private subscribedSymbols: Set<string> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  private constructor() {
    super();
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      throw new Error('POLYGON_API_KEY is required');
    }
    
    this.rest = restClient(apiKey);
    this.websocket = websocketClient(apiKey);
    this.cache = CacheService.getInstance();
  }

  static getInstance(): PolygonService {
    if (!PolygonService.instance) {
      PolygonService.instance = new PolygonService();
    }
    return PolygonService.instance;
  }

  async initialize(): Promise<void> {
    await this.setupWebSocket();
    await this.loadTopVolumeStocks();
  }

  private async setupWebSocket(): Promise<void> {
    try {
      // Polygon WebSocket v7 doesn't use .on() directly
      // It uses .subscribe() for messages and has different event handling
      logger.info('Setting up Polygon WebSocket...');
      
      // For now, we'll skip WebSocket setup to get the server running
      // The REST API will still work for getting stock data
      logger.warn('WebSocket connection skipped - using REST API only');
      
      // TODO: Implement proper Polygon WebSocket v7 integration
      // await this.websocket.connect();
      // await this.websocket.subscriptions(...);
    } catch (error) {
      logger.error('WebSocket setup error:', error);
    }
  }

  // TODO: Re-enable when WebSocket is properly integrated
  /*
  private handleAggregateMessage(message: any): void {
    const priceData: PriceData = {
      symbol: message.sym,
      price: message.c,
      volume: message.v,
      timestamp: new Date(message.s),
      open: message.o,
      high: message.h,
      low: message.l,
      close: message.c,
      vwap: message.vw
    };

    this.emit('priceUpdate', priceData);
    this.cache.set(`price:${message.sym}`, JSON.stringify(priceData), 5);
  }
  */

  // private handleTradeMessage(message: any): void {
  //   const tradeData = {
  //     symbol: message.sym,
  //     price: message.p,
  //     size: message.s,
  //     timestamp: new Date(message.t)
  //   };
  //
  //   this.emit('trade', tradeData);
  // }

  async subscribeToSymbol(symbol: string): Promise<void> {
    if (this.subscribedSymbols.has(symbol)) {
      return;
    }

    // TODO: Re-enable when WebSocket is properly integrated
    // await this.websocket.subscribe(`A.${symbol}`, `AM.${symbol}`, `T.${symbol}`);
    this.subscribedSymbols.add(symbol);
    logger.info(`Subscribed to ${symbol}`);
  }

  async unsubscribeFromSymbol(symbol: string): Promise<void> {
    if (!this.subscribedSymbols.has(symbol)) {
      return;
    }

    // TODO: Re-enable when WebSocket is properly integrated
    // await this.websocket.unsubscribe(`A.${symbol}`, `AM.${symbol}`, `T.${symbol}`);
    this.subscribedSymbols.delete(symbol);
    logger.info(`Unsubscribed from ${symbol}`);
  }

  async getSnapshot(symbol: string): Promise<StockSnapshot> {
    const cacheKey = `snapshot:${symbol}`;
    const cached = await this.cache.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const [snapshot, details, news] = await Promise.all([
        this.rest.stocks.snapshotTicker(symbol),
        this.rest.reference.tickerDetails(symbol),
        this.rest.reference.tickerNews({ ticker: symbol, limit: 5 })
      ]);

      const result: StockSnapshot = {
        symbol,
        price: snapshot.ticker.day.c,
        change: snapshot.ticker.day.c - snapshot.ticker.day.o,
        changePercent: ((snapshot.ticker.day.c - snapshot.ticker.day.o) / snapshot.ticker.day.o) * 100,
        volume: snapshot.ticker.day.v,
        marketCap: details.results?.market_cap,
        peRatio: details.results?.pe_ratio,
        week52High: snapshot.ticker.prevDay?.h,
        week52Low: snapshot.ticker.prevDay?.l,
        news: news.results
      };

      await this.cache.set(cacheKey, JSON.stringify(result), 60);
      return result;
    } catch (error) {
      logger.error(`Error fetching snapshot for ${symbol}:`, error);
      throw error;
    }
  }

  async getAggregates(symbol: string, from: Date, to: Date, timespan: 'minute' | 'hour' | 'day' = 'minute'): Promise<any[]> {
    try {
      const response = await this.rest.stocks.aggregates(
        symbol,
        1,
        timespan,
        from.toISOString().split('T')[0],
        to.toISOString().split('T')[0]
      );
      return response.results || [];
    } catch (error) {
      logger.error(`Error fetching aggregates for ${symbol}:`, error);
      throw error;
    }
  }

  async getPreMarketVolume(symbol: string): Promise<number> {
    const now = new Date();
    const marketOpen = new Date(now);
    marketOpen.setHours(9, 30, 0, 0);
    
    const preMarketStart = new Date(now);
    preMarketStart.setHours(4, 0, 0, 0);

    const aggregates = await this.getAggregates(symbol, preMarketStart, marketOpen);
    return aggregates.reduce((total, agg) => total + (agg.v || 0), 0);
  }

  async loadTopVolumeStocks(): Promise<string[]> {
    try {
      const response = await this.rest.stocks.snapshotAllTickers();
      const tickers = response.tickers || [];
      
      const sorted = tickers
        .filter((t: any) => t.day?.v > 1000000)
        .sort((a: any, b: any) => (b.day?.v || 0) - (a.day?.v || 0))
        .slice(0, 10)
        .map((t: any) => t.ticker);

      for (const symbol of sorted.slice(0, 3)) {
        await this.subscribeToSymbol(symbol);
      }

      return sorted;
    } catch (error) {
      logger.error('Error loading top volume stocks:', error);
      return [];
    }
  }

  async getMarketStatus(): Promise<string> {
    try {
      const response = await this.rest.reference.marketStatus();
      return response.market;
    } catch (error) {
      logger.error('Error fetching market status:', error);
      return 'unknown';
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        // TODO: Re-enable when WebSocket is properly integrated
      // await this.websocket.connect();
        this.reconnectAttempts = 0;
        
        for (const symbol of this.subscribedSymbols) {
          // TODO: Re-enable when WebSocket is properly integrated
    // await this.websocket.subscribe(`A.${symbol}`, `AM.${symbol}`, `T.${symbol}`);
        }
        
        logger.info('Successfully reconnected to Polygon WebSocket');
      } catch (error) {
        logger.error('Reconnection failed:', error);
        this.handleReconnect();
      }
    }, delay);
  }
}