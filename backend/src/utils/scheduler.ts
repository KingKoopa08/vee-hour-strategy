import cron from 'node-cron';
import moment from 'moment-timezone';
import { PolygonService } from '../services/polygon.service';
import { SafetyScoringService } from '../services/safety-scoring.service';
import { logger } from './logger';

const timezone = 'America/Denver';

export function scheduleCronJobs(): void {
  cron.schedule('0 5 * * 1-5', async () => {
    logger.info('Starting pre-market analysis at 5:00 AM MT');
    await startPreMarketAnalysis();
  }, {
    timezone,
    scheduled: true
  });

  cron.schedule('5 6 * * 1-5', async () => {
    logger.info('Executing 6:05 AM primary entry analysis');
    await executePrimaryEntryAnalysis();
  }, {
    timezone,
    scheduled: true
  });

  cron.schedule('35 6 * * 1-5', async () => {
    logger.info('Executing 6:35 AM directional bias confirmation');
    await executeDirectionalBiasAnalysis();
  }, {
    timezone,
    scheduled: true
  });

  cron.schedule('55 7 * * 1-5', async () => {
    logger.info('Executing 7:55 AM breakout analysis');
    await executeBreakoutAnalysis();
  }, {
    timezone,
    scheduled: true
  });

  cron.schedule('*/1 * * * *', async () => {
    await updateTopVolumeStocks();
  }, {
    scheduled: true
  });

  cron.schedule('*/5 * * * *', async () => {
    await updateSafetyScores();
  }, {
    scheduled: true
  });

  logger.info('Cron jobs scheduled successfully');
}

async function startPreMarketAnalysis(): Promise<void> {
  try {
    const polygonService = PolygonService.getInstance();
    const topStocks = await polygonService.loadTopVolumeStocks();
    
    for (const symbol of topStocks.slice(0, 5)) {
      await polygonService.subscribeToSymbol(symbol);
    }
    
    logger.info(`Pre-market analysis started for: ${topStocks.slice(0, 5).join(', ')}`);
  } catch (error) {
    logger.error('Error in pre-market analysis:', error);
  }
}

async function executePrimaryEntryAnalysis(): Promise<void> {
  try {
    logger.info('Analyzing primary entry opportunities at 6:05 AM');
  } catch (error) {
    logger.error('Error in primary entry analysis:', error);
  }
}

async function executeDirectionalBiasAnalysis(): Promise<void> {
  try {
    logger.info('Confirming directional bias at 6:35 AM');
  } catch (error) {
    logger.error('Error in directional bias analysis:', error);
  }
}

async function executeBreakoutAnalysis(): Promise<void> {
  try {
    logger.info('Analyzing breakout opportunities at 7:55 AM');
  } catch (error) {
    logger.error('Error in breakout analysis:', error);
  }
}

async function updateTopVolumeStocks(): Promise<void> {
  try {
    const currentTime = moment().tz(timezone);
    const marketHours = currentTime.hours() >= 4 && currentTime.hours() < 20;
    
    if (marketHours && currentTime.day() >= 1 && currentTime.day() <= 5) {
      const polygonService = PolygonService.getInstance();
      await polygonService.loadTopVolumeStocks();
    }
  } catch (error) {
    logger.error('Error updating top volume stocks:', error);
  }
}

async function updateSafetyScores(): Promise<void> {
  try {
    const currentTime = moment().tz(timezone);
    const marketHours = currentTime.hours() >= 4 && currentTime.hours() < 20;
    
    if (marketHours && currentTime.day() >= 1 && currentTime.day() <= 5) {
      const safetyScoring = SafetyScoringService.getInstance();
      await safetyScoring.scanTopSafeStocks(10);
    }
  } catch (error) {
    logger.error('Error updating safety scores:', error);
  }
}