import { PolygonService } from './polygon.service';
import { logger } from '../utils/logger';

export interface SafetyMetrics {
  marketCapScore: number;
  peRatioScore: number;
  volumeScore: number;
  technicalScore: number;
  newsScore: number;
  overallScore: number;
  recommendation: 'SAFE' | 'MODERATE' | 'RISKY';
}

export class SafetyScoringService {
  private static instance: SafetyScoringService;
  private polygonService: PolygonService;
  private safetyScores: Map<string, SafetyMetrics> = new Map();

  private constructor() {
    this.polygonService = PolygonService.getInstance();
  }

  static getInstance(): SafetyScoringService {
    if (!SafetyScoringService.instance) {
      SafetyScoringService.instance = new SafetyScoringService();
    }
    return SafetyScoringService.instance;
  }

  async updateSafetyScore(symbol: string): Promise<SafetyMetrics> {
    try {
      const snapshot = await this.polygonService.getSnapshot(symbol);
      const metrics = this.calculateMetrics(snapshot);
      this.safetyScores.set(symbol, metrics);
      return metrics;
    } catch (error) {
      logger.error(`Error updating safety score for ${symbol}:`, error);
      return this.getDefaultMetrics();
    }
  }

  calculateScore(symbol: string): number {
    const metrics = this.safetyScores.get(symbol);
    return metrics ? metrics.overallScore : 5;
  }

  private calculateMetrics(snapshot: any): SafetyMetrics {
    const marketCapScore = this.scoreMarketCap(snapshot.marketCap);
    const peRatioScore = this.scorePERatio(snapshot.peRatio);
    const volumeScore = this.scoreVolume(snapshot.volume);
    const technicalScore = this.scoreTechnicalPosition(snapshot);
    const newsScore = this.scoreNews(snapshot.news);

    const weights = {
      marketCap: 0.30,
      peRatio: 0.25,
      volume: 0.25,
      technical: 0.15,
      news: 0.05
    };

    const overallScore = 
      marketCapScore * weights.marketCap +
      peRatioScore * weights.peRatio +
      volumeScore * weights.volume +
      technicalScore * weights.technical +
      newsScore * weights.news;

    const recommendation = this.getRecommendation(overallScore);

    return {
      marketCapScore,
      peRatioScore,
      volumeScore,
      technicalScore,
      newsScore,
      overallScore,
      recommendation
    };
  }

  private scoreMarketCap(marketCap?: number): number {
    if (!marketCap) return 5;

    if (marketCap > 10_000_000_000) return 10;
    if (marketCap > 2_000_000_000) return 9;
    if (marketCap > 500_000_000) return 8;
    if (marketCap > 100_000_000) return 7;
    if (marketCap > 50_000_000) return 6;
    if (marketCap > 10_000_000) return 5;
    if (marketCap > 1_000_000) return 4;
    return 3;
  }

  private scorePERatio(peRatio?: number): number {
    if (!peRatio) return 5;

    if (peRatio < 0) return 3;
    if (peRatio > 100) return 4;
    if (peRatio > 50) return 5;
    if (peRatio > 30) return 6;
    if (peRatio > 20) return 7;
    if (peRatio > 15) return 8;
    if (peRatio > 10) return 9;
    if (peRatio > 5) return 10;
    return 7;
  }

  private scoreVolume(volume: number): number {
    if (volume > 100_000_000) return 10;
    if (volume > 50_000_000) return 9;
    if (volume > 20_000_000) return 8;
    if (volume > 10_000_000) return 7;
    if (volume > 5_000_000) return 6;
    if (volume > 1_000_000) return 5;
    if (volume > 500_000) return 4;
    if (volume > 100_000) return 3;
    return 2;
  }

  private scoreTechnicalPosition(snapshot: any): number {
    if (!snapshot.week52High || !snapshot.week52Low) return 5;

    const currentPrice = snapshot.price;
    const range = snapshot.week52High - snapshot.week52Low;
    const positionInRange = (currentPrice - snapshot.week52Low) / range;

    if (positionInRange > 0.95) return 3;
    if (positionInRange > 0.90) return 4;
    if (positionInRange > 0.80) return 5;
    if (positionInRange > 0.70) return 6;
    if (positionInRange > 0.50) return 7;
    if (positionInRange > 0.30) return 8;
    if (positionInRange > 0.20) return 9;
    if (positionInRange > 0.10) return 10;
    return 9;
  }

  private scoreNews(news?: any[]): number {
    if (!news || news.length === 0) return 5;

    let positiveCount = 0;
    let negativeCount = 0;

    for (const article of news) {
      const sentiment = this.analyzeSentiment(article.title + ' ' + (article.description || ''));
      if (sentiment > 0) positiveCount++;
      if (sentiment < 0) negativeCount++;
    }

    const netSentiment = positiveCount - negativeCount;

    if (netSentiment >= 3) return 9;
    if (netSentiment >= 2) return 8;
    if (netSentiment >= 1) return 7;
    if (netSentiment === 0) return 6;
    if (netSentiment === -1) return 5;
    if (netSentiment === -2) return 4;
    return 3;
  }

  private analyzeSentiment(text: string): number {
    const positiveWords = [
      'beat', 'exceed', 'surge', 'jump', 'soar', 'rally', 'gain', 'rise',
      'upgrade', 'positive', 'strong', 'growth', 'profit', 'revenue', 'breakthrough'
    ];
    
    const negativeWords = [
      'miss', 'fall', 'drop', 'decline', 'loss', 'weak', 'concern', 'risk',
      'downgrade', 'negative', 'lawsuit', 'investigation', 'bankruptcy', 'layoff'
    ];

    const lowerText = text.toLowerCase();
    let score = 0;

    for (const word of positiveWords) {
      if (lowerText.includes(word)) score++;
    }

    for (const word of negativeWords) {
      if (lowerText.includes(word)) score--;
    }

    return score;
  }

  private getRecommendation(score: number): 'SAFE' | 'MODERATE' | 'RISKY' {
    if (score >= 7) return 'SAFE';
    if (score >= 5) return 'MODERATE';
    return 'RISKY';
  }

  private getDefaultMetrics(): SafetyMetrics {
    return {
      marketCapScore: 5,
      peRatioScore: 5,
      volumeScore: 5,
      technicalScore: 5,
      newsScore: 5,
      overallScore: 5,
      recommendation: 'MODERATE'
    };
  }

  getSafetyMetrics(symbol: string): SafetyMetrics | null {
    return this.safetyScores.get(symbol) || null;
  }

  async scanTopSafeStocks(limit: number = 10): Promise<Array<{ symbol: string; metrics: SafetyMetrics }>> {
    const topVolume = await this.polygonService.loadTopVolumeStocks();
    const results: Array<{ symbol: string; metrics: SafetyMetrics }> = [];

    for (const symbol of topVolume.slice(0, limit)) {
      const metrics = await this.updateSafetyScore(symbol);
      results.push({ symbol, metrics });
    }

    return results.sort((a, b) => b.metrics.overallScore - a.metrics.overallScore);
  }
}