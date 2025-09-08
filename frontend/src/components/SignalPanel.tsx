'use client'

import { useSignals } from '@/hooks/useSignals'
import { format } from 'date-fns'
import { ArrowUpIcon, ArrowDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid'

interface SignalPanelProps {
  symbol: string
}

export function SignalPanel({ symbol }: SignalPanelProps) {
  const { signals, loading } = useSignals(symbol)

  const getSignalIcon = (type: string) => {
    switch (type) {
      case 'BUY':
        return <ArrowUpIcon className="w-5 h-5 text-trading-green" />
      case 'SELL':
        return <ArrowDownIcon className="w-5 h-5 text-trading-red" />
      case 'WARNING':
        return <ExclamationTriangleIcon className="w-5 h-5 text-trading-yellow" />
      default:
        return null
    }
  }

  const getSignalColor = (type: string) => {
    switch (type) {
      case 'BUY':
        return 'border-trading-green text-trading-green'
      case 'SELL':
        return 'border-trading-red text-trading-red'
      case 'WARNING':
        return 'border-trading-yellow text-trading-yellow'
      default:
        return 'border-gray-500 text-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="bg-trading-gray rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-10 bg-gray-700 rounded"></div>
            <div className="h-10 bg-gray-700 rounded"></div>
            <div className="h-10 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-trading-gray rounded-lg p-6">
      <h3 className="text-xl font-bold mb-4">Trading Signals</h3>
      
      {signals.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No signals available</p>
      ) : (
        <div className="space-y-3">
          {signals.map((signal, index) => (
            <div
              key={index}
              className={`border rounded-lg p-4 ${getSignalColor(signal.type)}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  {getSignalIcon(signal.type)}
                  <div>
                    <p className="font-bold text-lg">{signal.type}</p>
                    <p className="text-sm text-gray-400">
                      {format(new Date(signal.timestamp), 'HH:mm:ss')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold">${signal.price.toFixed(2)}</p>
                  <p className="text-sm">
                    Confidence: {signal.confidence}%
                  </p>
                </div>
              </div>
              
              <p className="mt-3 text-sm">{signal.reason}</p>
              
              {signal.targetPrice && (
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Target:</span>
                    <span className="ml-2 text-trading-green">
                      ${signal.targetPrice.toFixed(2)}
                    </span>
                  </div>
                  {signal.stopLoss && (
                    <div>
                      <span className="text-gray-400">Stop Loss:</span>
                      <span className="ml-2 text-trading-red">
                        ${signal.stopLoss.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
              
              {signal.timeWindow && (
                <div className="mt-2">
                  <span className="text-xs bg-trading-dark px-2 py-1 rounded">
                    Time Window: {signal.timeWindow}
                  </span>
                </div>
              )}
              
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">VWAP:</span>
                  <span className="ml-1">${signal.indicators.vwap.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-400">RSI:</span>
                  <span className="ml-1">{signal.indicators.rsi.toFixed(1)}</span>
                </div>
                <div>
                  <span className="text-gray-400">Vol:</span>
                  <span className="ml-1">{signal.indicators.volumeRatio.toFixed(1)}x</span>
                </div>
                <div>
                  <span className="text-gray-400">vs VWAP:</span>
                  <span className="ml-1">{signal.indicators.priceVsVWAP.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}