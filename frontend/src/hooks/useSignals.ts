import { useQuery } from '@tanstack/react-query'
import { useWebSocket } from './useWebSocket'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { toast } from 'react-hot-toast'

interface Signal {
  type: string
  strength: string
  symbol: string
  price: number
  timestamp: string
  reason: string
  confidence: number
  targetPrice?: number
  stopLoss?: number
  timeWindow?: string
  indicators: {
    vwap: number
    rsi: number
    volumeRatio: number
    priceVsVWAP: number
  }
}

export function useSignals(symbol: string) {
  const { lastMessage } = useWebSocket()
  const [realtimeSignals, setRealtimeSignals] = useState<Signal[]>([])

  const { data: historicalSignals = [], isLoading } = useQuery({
    queryKey: ['signals', symbol],
    queryFn: () => api.getSignals(symbol),
    refetchInterval: 10000,
  })

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'priceUpdate' && lastMessage.data.signals) {
      const signal = lastMessage.data.signals
      if (signal && signal.symbol === symbol) {
        setRealtimeSignals(prev => [signal, ...prev].slice(0, 10))
        
        if (signal.type === 'BUY' && signal.strength === 'STRONG') {
          toast.success(`Strong BUY signal for ${symbol} at $${signal.price}`, {
            duration: 10000,
          })
        } else if (signal.type === 'SELL') {
          toast.error(`SELL signal for ${symbol} at $${signal.price}`, {
            duration: 10000,
          })
        } else if (signal.type === 'WARNING') {
          toast.error(`WARNING for ${symbol}: ${signal.reason}`, {
            duration: 10000,
          })
        }
      }
    }
  }, [lastMessage, symbol])

  const allSignals = [...realtimeSignals, ...historicalSignals]
    .filter((signal, index, self) => 
      index === self.findIndex((s) => 
        s.timestamp === signal.timestamp && s.symbol === signal.symbol
      )
    )
    .slice(0, 20)

  return {
    signals: allSignals,
    loading: isLoading
  }
}