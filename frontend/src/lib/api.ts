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
    const { data } = await apiClient.get('/stocks/top-volume')
    return data.data
  },

  async getSnapshot(symbol: string) {
    const { data } = await apiClient.get(`/stocks/${symbol}/snapshot`)
    return data.data
  },

  async getIndicators(symbol: string) {
    const { data } = await apiClient.get(`/stocks/${symbol}/indicators`)
    return data.data
  },

  async getSignals(symbol: string) {
    const { data } = await apiClient.get(`/stocks/${symbol}/signals`)
    return data.data
  },

  async getSafetyScore(symbol: string) {
    const { data } = await apiClient.get(`/stocks/${symbol}/safety`)
    return data.data
  },

  async subscribeToSymbol(symbol: string) {
    const { data } = await apiClient.post(`/stocks/${symbol}/subscribe`)
    return data
  },

  async unsubscribeFromSymbol(symbol: string) {
    const { data } = await apiClient.delete(`/stocks/${symbol}/subscribe`)
    return data
  },

  async getMarketStatus() {
    const { data } = await apiClient.get('/market/status')
    return data.data.status
  },

  async getSafeStocks(limit: number = 10) {
    const { data } = await apiClient.get(`/scanner/safe-stocks?limit=${limit}`)
    return data.data
  },

  async getAllSignals() {
    const { data } = await apiClient.get('/signals/all')
    return data.data
  },

  async getHistoricalData(symbol: string) {
    const to = new Date()
    const from = new Date()
    from.setHours(from.getHours() - 24)
    
    const { data } = await apiClient.get(`/historical/${symbol}`, {
      params: {
        from: from.toISOString(),
        to: to.toISOString(),
        timespan: 'minute'
      }
    })
    return data.data
  },

  async getPreMarketVolume(symbol: string) {
    const { data } = await apiClient.get(`/premarket/${symbol}/volume`)
    return data.data
  }
}