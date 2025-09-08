import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';

interface Client {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  isAlive: boolean;
}

export class WebSocketManager {
  private clients: Map<string, Client> = new Map();
  private wss: WebSocketServer;
  private heartbeatInterval: NodeJS.Timeout | undefined;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.setupWebSocketServer();
    this.startHeartbeat();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();
      const client: Client = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        isAlive: true
      };

      this.clients.set(clientId, client);
      logger.info(`WebSocket client connected: ${clientId}`);

      ws.on('message', (message: string) => {
        this.handleMessage(clientId, message.toString());
      });

      ws.on('pong', () => {
        client.isAlive = true;
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info(`WebSocket client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}:`, error);
      });

      this.sendToClient(clientId, 'connected', { 
        clientId, 
        message: 'Connected to trading analysis platform' 
      });
    });
  }

  private handleMessage(clientId: string, message: string): void {
    try {
      const data = JSON.parse(message);
      const { type, payload } = data;

      switch (type) {
        case 'subscribe':
          this.handleSubscribe(clientId, payload.symbols);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(clientId, payload.symbols);
          break;
        case 'ping':
          this.sendToClient(clientId, 'pong', { timestamp: Date.now() });
          break;
        default:
          logger.warn(`Unknown message type: ${type}`);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message:', error);
    }
  }

  private handleSubscribe(clientId: string, symbols: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    symbols.forEach(symbol => {
      client.subscriptions.add(symbol);
    });

    this.sendToClient(clientId, 'subscribed', { symbols });
    logger.info(`Client ${clientId} subscribed to: ${symbols.join(', ')}`);
  }

  private handleUnsubscribe(clientId: string, symbols: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    symbols.forEach(symbol => {
      client.subscriptions.delete(symbol);
    });

    this.sendToClient(clientId, 'unsubscribed', { symbols });
    logger.info(`Client ${clientId} unsubscribed from: ${symbols.join(', ')}`);
  }

  sendToClient(clientId: string, type: string, data: any): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    client.ws.send(message);
  }

  broadcastToSubscribers(symbol: string, type: string, data: any): void {
    this.clients.forEach(client => {
      if (client.subscriptions.has(symbol) && client.ws.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
        client.ws.send(message);
      }
    });
  }

  broadcastToAll(type: string, data: any): void {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    
    this.clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(clientId);
          logger.info(`Client ${clientId} terminated due to inactivity`);
          return;
        }

        client.isAlive = false;
        client.ws.ping();
      });
    }, 30000);
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  getConnectedClients(): number {
    return this.clients.size;
  }

  cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.clients.forEach(client => {
      client.ws.close();
    });
    
    this.clients.clear();
  }
}