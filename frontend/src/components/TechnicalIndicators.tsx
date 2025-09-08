'use client'

import { useStockData } from '@/hooks/useStockData'

interface TechnicalIndicatorsProps {
  symbol: string
}

export function TechnicalIndicators({ symbol }: TechnicalIndicatorsProps) {
  const { indicators, loading } = useStockData(symbol)

  if (loading || !indicators) {
    return (
      <div className="bg-trading-gray rounded-lg p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-20 bg-gray-700 rounded"></div>
            <div className="h-20 bg-gray-700 rounded"></div>
            <div className="h-20 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  const getRSIColor = (rsi: number) => {
    if (rsi > 70) return 'text-trading-red'
    if (rsi < 30) return 'text-trading-green'
    return 'text-white'
  }

  return (
    <div className="bg-trading-gray rounded-lg p-4">
      <h3 className="text-lg font-bold mb-4">Technical Indicators</h3>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-trading-dark p-3 rounded">
          <p className="text-xs text-gray-400 mb-1">VWAP</p>
          <p className="text-lg font-bold text-vwap">
            ${indicators.vwap.toFixed(2)}
          </p>
        </div>
        
        <div className="bg-trading-dark p-3 rounded">
          <p className="text-xs text-gray-400 mb-1">RSI(14)</p>
          <p className={`text-lg font-bold ${getRSIColor(indicators.rsi)}`}>
            {indicators.rsi.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500">
            {indicators.rsi > 70 ? 'Overbought' : indicators.rsi < 30 ? 'Oversold' : 'Neutral'}
          </p>
        </div>
        
        <div className="bg-trading-dark p-3 rounded">
          <p className="text-xs text-gray-400 mb-1">SMA(20)</p>
          <p className="text-lg font-bold">
            ${indicators.sma20.toFixed(2)}
          </p>
        </div>
        
        <div className="bg-trading-dark p-3 rounded">
          <p className="text-xs text-gray-400 mb-1">EMA(9)</p>
          <p className="text-lg font-bold">
            ${indicators.ema9.toFixed(2)}
          </p>
        </div>
        
        <div className="bg-trading-dark p-3 rounded">
          <p className="text-xs text-gray-400 mb-1">Volume Ratio</p>
          <p className={`text-lg font-bold ${
            indicators.volumeRatio > 1.5 ? 'text-trading-green' : 
            indicators.volumeRatio < 0.5 ? 'text-trading-red' : 'text-white'
          }`}>
            {indicators.volumeRatio.toFixed(2)}x
          </p>
        </div>
        
        <div className="bg-trading-dark p-3 rounded">
          <p className="text-xs text-gray-400 mb-1">Price Change</p>
          <p className={`text-lg font-bold ${
            indicators.priceChangePercent > 0 ? 'text-trading-green' : 'text-trading-red'
          }`}>
            {indicators.priceChangePercent > 0 ? '+' : ''}{indicators.priceChangePercent.toFixed(2)}%
          </p>
        </div>
      </div>
      
      <div className="mt-4 bg-trading-dark p-3 rounded">
        <p className="text-xs text-gray-400 mb-2">Bollinger Bands</p>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Upper:</span>
            <span className="ml-2 font-bold">${indicators.bollingerBands.upper.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-500">Middle:</span>
            <span className="ml-2 font-bold">${indicators.bollingerBands.middle.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-500">Lower:</span>
            <span className="ml-2 font-bold">${indicators.bollingerBands.lower.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}