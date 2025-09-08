'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/solid'

interface SafeStock {
  symbol: string
  metrics: {
    marketCapScore: number
    peRatioScore: number
    volumeScore: number
    technicalScore: number
    newsScore: number
    overallScore: number
    recommendation: 'SAFE' | 'MODERATE' | 'RISKY'
  }
}

interface StockScannerProps {
  topVolume: string[]
  selectedSymbol: string
  onSelectSymbol: (symbol: string) => void
}

export function StockScanner({ topVolume, selectedSymbol, onSelectSymbol }: StockScannerProps) {
  const { data: safeStocks } = useQuery<SafeStock[]>({
    queryKey: ['safeStocks'],
    queryFn: () => api.getSafeStocks(5),
    refetchInterval: 60000,
  })

  return (
    <div className="bg-trading-gray rounded-lg p-4">
      <h3 className="text-lg font-bold mb-4">Top Volume Stocks</h3>
      
      <div className="space-y-2">
        {topVolume.slice(0, 5).map((symbol) => (
          <button
            key={symbol}
            onClick={() => onSelectSymbol(symbol)}
            className={`w-full text-left p-3 rounded-lg transition-all ${
              selectedSymbol === symbol
                ? 'bg-trading-green text-black'
                : 'bg-trading-dark hover:bg-gray-800'
            }`}
          >
            <div className="flex justify-between items-center">
              <span className="font-bold">{symbol}</span>
              {safeStocks?.find((s: any) => s.symbol === symbol) && (
                <span className="text-xs px-2 py-1 bg-green-900 text-green-300 rounded">
                  Safe: {safeStocks.find((s: any) => s.symbol === symbol)?.metrics.overallScore.toFixed(1)}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-semibold text-gray-400 mb-2">Safety Leaders</h4>
        <div className="space-y-1">
          {safeStocks?.slice(0, 3).map((stock) => (
            <div
              key={stock.symbol}
              className="text-xs p-2 bg-trading-dark rounded flex justify-between"
            >
              <span>{stock.symbol}</span>
              <span className={`font-bold ${
                stock.metrics.recommendation === 'SAFE' ? 'text-trading-green' :
                stock.metrics.recommendation === 'MODERATE' ? 'text-trading-yellow' :
                'text-trading-red'
              }`}>
                {stock.metrics.overallScore.toFixed(1)}/10
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}