'use client'

import { useEffect, useState } from 'react'
import { Dashboard } from '@/components/Dashboard'
import { Header } from '@/components/Header'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useMarketData } from '@/hooks/useMarketData'

export default function Home() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('AAPL')
  const { isConnected, subscribe, unsubscribe } = useWebSocket()
  const { topVolume, marketStatus } = useMarketData()

  useEffect(() => {
    if (isConnected && selectedSymbol) {
      subscribe([selectedSymbol])
      return () => unsubscribe([selectedSymbol])
    }
  }, [isConnected, selectedSymbol, subscribe, unsubscribe])

  return (
    <main className="min-h-screen bg-trading-dark">
      <Header 
        marketStatus={marketStatus}
        isConnected={isConnected}
      />
      <Dashboard
        selectedSymbol={selectedSymbol}
        setSelectedSymbol={setSelectedSymbol}
        topVolume={topVolume}
      />
      <div className="fixed bottom-4 right-4 text-xs text-gray-500">
        <p className="mb-1">Educational purposes only</p>
        <p>Not financial advice</p>
      </div>
    </main>
  )
}