import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { initializeDatabase } from './database/connection';
import { PolygonService } from './services/polygon.service';
import { TechnicalAnalysisService } from './services/technical-analysis.service';
import { SignalGeneratorService } from './services/signal-generator.service';
import { WebSocketManager } from './services/websocket.service';
import { CacheService } from './services/cache.service';
import apiRoutes from './routes/api.routes';
import { logger } from './utils/logger';
import { scheduleCronJobs } from './utils/scheduler';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 3002;

app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const wss = new WebSocketServer({ port: Number(WS_PORT) });
const wsManager = new WebSocketManager(wss);

async function startServer() {
  try {
    await initializeDatabase();
    logger.info('Database connected successfully');

    await CacheService.getInstance().connect();
    logger.info('Redis cache connected successfully');

    const polygonService = PolygonService.getInstance();
    await polygonService.initialize();
    logger.info('Polygon service initialized');

    const technicalAnalysis = TechnicalAnalysisService.getInstance();
    const signalGenerator = SignalGeneratorService.getInstance();

    polygonService.on('priceUpdate', (data) => {
      technicalAnalysis.updateIndicators(data);
      const signals = signalGenerator.generateSignals(data);
      wsManager.broadcastToAll('priceUpdate', { ...data, signals });
    });

    scheduleCronJobs();

    server.listen(PORT, () => {
      logger.info(`Backend server running on port ${PORT}`);
      logger.info(`WebSocket server running on port ${WS_PORT}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close();
  wss.close();
  process.exit(0);
});

startServer();