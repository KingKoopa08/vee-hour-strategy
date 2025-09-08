import { Router } from 'express';
import { PolygonService } from '../services/polygon.service';
import { TechnicalAnalysisService } from '../services/technical-analysis.service';
import { SignalGeneratorService } from '../services/signal-generator.service';
import { SafetyScoringService } from '../services/safety-scoring.service';
import { logger } from '../utils/logger';

const router = Router();
const polygonService = PolygonService.getInstance();
const technicalAnalysis = TechnicalAnalysisService.getInstance();
const signalGenerator = SignalGeneratorService.getInstance();
const safetyScoring = SafetyScoringService.getInstance();

router.get('/stocks/top-volume', async (_req, res) => {
  try {
    const stocks = await polygonService.loadTopVolumeStocks();
    res.json({ success: true, data: stocks });
  } catch (error) {
    logger.error('Error fetching top volume stocks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch top volume stocks' });
  }
});

router.get('/stocks/:symbol/snapshot', async (req, res) => {
  try {
    const { symbol } = req.params;
    const snapshot = await polygonService.getSnapshot(symbol.toUpperCase());
    res.json({ success: true, data: snapshot });
  } catch (error) {
    logger.error('Error fetching stock snapshot:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stock snapshot' });
  }
});

router.get('/stocks/:symbol/indicators', async (req, res) => {
  try {
    const { symbol } = req.params;
    const indicators = technicalAnalysis.getIndicators(symbol.toUpperCase());
    
    if (!indicators) {
      res.status(404).json({ success: false, error: 'No indicators available for this symbol' });
    } else {
      res.json({ success: true, data: indicators });
    }
  } catch (error) {
    logger.error('Error fetching indicators:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch indicators' });
  }
});

router.get('/stocks/:symbol/signals', async (req, res) => {
  try {
    const { symbol } = req.params;
    const signals = signalGenerator.getRecentSignals(symbol.toUpperCase());
    res.json({ success: true, data: signals });
  } catch (error) {
    logger.error('Error fetching signals:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch signals' });
  }
});

router.get('/stocks/:symbol/safety', async (req, res) => {
  try {
    const { symbol } = req.params;
    const safety = await safetyScoring.updateSafetyScore(symbol.toUpperCase());
    res.json({ success: true, data: safety });
  } catch (error) {
    logger.error('Error fetching safety score:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch safety score' });
  }
});

router.post('/stocks/:symbol/subscribe', async (req, res) => {
  try {
    const { symbol } = req.params;
    await polygonService.subscribeToSymbol(symbol.toUpperCase());
    res.json({ success: true, message: `Subscribed to ${symbol}` });
  } catch (error) {
    logger.error('Error subscribing to symbol:', error);
    res.status(500).json({ success: false, error: 'Failed to subscribe to symbol' });
  }
});

router.delete('/stocks/:symbol/subscribe', async (req, res) => {
  try {
    const { symbol } = req.params;
    await polygonService.unsubscribeFromSymbol(symbol.toUpperCase());
    res.json({ success: true, message: `Unsubscribed from ${symbol}` });
  } catch (error) {
    logger.error('Error unsubscribing from symbol:', error);
    res.status(500).json({ success: false, error: 'Failed to unsubscribe from symbol' });
  }
});

router.get('/market/status', async (_req, res) => {
  try {
    const status = await polygonService.getMarketStatus();
    res.json({ success: true, data: { status } });
  } catch (error) {
    logger.error('Error fetching market status:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch market status' });
  }
});

router.get('/scanner/safe-stocks', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const safeStocks = await safetyScoring.scanTopSafeStocks(limit);
    res.json({ success: true, data: safeStocks });
  } catch (error) {
    logger.error('Error scanning safe stocks:', error);
    res.status(500).json({ success: false, error: 'Failed to scan safe stocks' });
  }
});

router.get('/signals/all', async (_req, res) => {
  try {
    const signals = signalGenerator.getRecentSignals();
    res.json({ success: true, data: signals });
  } catch (error) {
    logger.error('Error fetching all signals:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch signals' });
  }
});

router.get('/historical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { from, to, timespan } = req.query;
    
    const fromDate = new Date(from as string);
    const toDate = new Date(to as string);
    const span = (timespan as 'minute' | 'hour' | 'day') || 'minute';
    
    const aggregates = await polygonService.getAggregates(
      symbol.toUpperCase(),
      fromDate,
      toDate,
      span
    );
    
    res.json({ success: true, data: aggregates });
  } catch (error) {
    logger.error('Error fetching historical data:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch historical data' });
  }
});

router.get('/premarket/:symbol/volume', async (req, res) => {
  try {
    const { symbol } = req.params;
    const volume = await polygonService.getPreMarketVolume(symbol.toUpperCase());
    res.json({ success: true, data: { symbol, preMarketVolume: volume } });
  } catch (error) {
    logger.error('Error fetching pre-market volume:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pre-market volume' });
  }
});

export default router;