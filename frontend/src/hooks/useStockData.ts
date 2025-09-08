import { useQuery } from '@tanstack/react-query'
import { useWebSocket } from './useWebSocket'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export function useStockData(symbol: string) {
  const { lastMessage } = useWebSocket()
  const [realtimeData, setRealtimeData] = useState<any>(null)

  const { data: snapshot, isLoading: snapshotLoading } = useQuery({
    queryKey: ['snapshot', symbol],
    queryFn: () => api.getSnapshot(symbol),
    refetchInterval: 30000,
  })

  const { data: indicators, isLoading: indicatorsLoading } = useQuery({
    queryKey: ['indicators', symbol],
    queryFn: () => api.getIndicators(symbol),
    refetchInterval: 5000,
  })

  const { data: historicalData } = useQuery({
    queryKey: ['historical', symbol],
    queryFn: () => api.getHistoricalData(symbol),
    refetchInterval: 60000,
  })

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'priceUpdate' && lastMessage.data.symbol === symbol) {
      setRealtimeData(lastMessage.data)
    }
  }, [lastMessage, symbol])

  const priceData = realtimeData ? [realtimeData] : historicalData || []

  return {
    snapshot,
    indicators,
    priceData,
    realtimeData,
    loading: snapshotLoading || indicatorsLoading
  }
}