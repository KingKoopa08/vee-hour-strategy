import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const api = {
  async getTopVolume() {
    const { data } = await apiClient.get('/gainers')
    // Return array of symbols from the stocks list
    return data.stocks?.map((stock: any) => stock.symbol) || []
  },

  async getGainers() {
    const { data } = await apiClient.get('/gainers')
    return data.stocks || []
  },

  async getRising() {
    const { data } = await apiClient.get('/rising')
    return data.stocks || []
  },

  async getVolumeMovers() {
    const { data } = await apiClient.get('/volume')
    return data.stocks || []
  },

  async getSpikes() {
    const { data } = await apiClient.get('/spikes')
    return data.stocks || []
  },

  async getWhales() {
    const { data } = await apiClient.get('/whales')
    return data.orders || []
  },

  async getSnapshot(symbol: string) {
    // Get from gainers list for now
    const gainers = await this.getGainers()
    return gainers.find((s: any) => s.symbol === symbol)
  },

  async getIndicators(symbol: string) {
    // Get from gainers list for now
    const gainers = await this.getGainers()
    const stock = gainers.find((s: any) => s.symbol === symbol)
    return stock ? {
      rsi: stock.rsi,
      macd: stock.macd,
      volume: stock.volume
    } : null
  },

  async getSignals(symbol: string) {
    // Get spike data which contains signals
    const spikes = await this.getSpikes()
    return spikes.find((s: any) => s.symbol === symbol)
  },

  async getSafetyScore(symbol: string) {
    // Return mock data for now
    return {
      score: 7.5,
      recommendation: 'MODERATE'
    }
  },

  async subscribeToSymbol(symbol: string) {
    return { success: true }
  },

  async unsubscribeFromSymbol(symbol: string) {
    return { success: true }
  },

  async getMarketStatus() {
    // Determine based on time (ET)
    const now = new Date()
    const etOffset = -5
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
    const et = new Date(utc + (3600000 * etOffset))
    const hours = et.getHours()
    const minutes = et.getMinutes()
    const time = hours * 100 + minutes

    if (time >= 400 && time < 930) {
      return 'premarket'
    } else if (time >= 930 && time < 1600) {
      return 'open'
    } else if (time >= 1600 && time < 2000) {
      return 'afterhours'
    } else {
      return 'closed'
    }
  },

  async getSafeStocks(limit: number = 10) {
    // Get top gainers with good volume
    const gainers = await this.getGainers()
    return gainers.slice(0, limit).map((stock: any) => ({
      symbol: stock.symbol,
      metrics: {
        marketCapScore: 8,
        peRatioScore: 7,
        volumeScore: 9,
        technicalScore: 8,
        newsScore: 7,
        overallScore: 7.8,
        recommendation: stock.dayChange > 5 ? 'SAFE' : 'MODERATE'
      }
    }))
  },

  async getAllSignals() {
    const spikes = await this.getSpikes()
    return spikes
  },

  async getHistoricalData(symbol: string) {
    // Not implemented yet
    return []
  },

  async getPreMarketVolume(symbol: string) {
    const gainers = await this.getGainers()
    const stock = gainers.find((s: any) => s.symbol === symbol)
    return stock?.volume || 0
  }
}