'use client'

import { useState } from 'react'
import { StockScanner } from './StockScanner'
import { ChartContainer } from './ChartContainer'
import { SignalPanel } from './SignalPanel'
import { TechnicalIndicators } from './TechnicalIndicators'
import { TimeWindowAlert } from './TimeWindowAlert'
import { SafetyScore } from './SafetyScore'

interface DashboardProps {
  selectedSymbol: string
  setSelectedSymbol: (symbol: string) => void
  topVolume: string[]
}

export function Dashboard({ selectedSymbol, setSelectedSymbol, topVolume }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'chart' | 'scanner' | 'signals'>('chart')

  return (
    <div className="container mx-auto px-4 py-6">
      <TimeWindowAlert />
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <div className="lg:col-span-1">
          <StockScanner
            topVolume={topVolume}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={setSelectedSymbol}
          />
        </div>
        
        <div className="lg:col-span-3">
          <div className="bg-trading-gray rounded-lg p-4 mb-4">
            <div className="flex space-x-4 mb-4">
              <button
                onClick={() => setActiveTab('chart')}
                className={`px-4 py-2 rounded ${
                  activeTab === 'chart' 
                    ? 'bg-trading-green text-black' 
                    : 'bg-trading-dark text-white'
                }`}
              >
                Chart View
              </button>
              <button
                onClick={() => setActiveTab('scanner')}
                className={`px-4 py-2 rounded ${
                  activeTab === 'scanner' 
                    ? 'bg-trading-green text-black' 
                    : 'bg-trading-dark text-white'
                }`}
              >
                Safety Scanner
              </button>
              <button
                onClick={() => setActiveTab('signals')}
                className={`px-4 py-2 rounded ${
                  activeTab === 'signals' 
                    ? 'bg-trading-green text-black' 
                    : 'bg-trading-dark text-white'
                }`}
              >
                Signals
              </button>
            </div>

            {activeTab === 'chart' && (
              <div className="space-y-4">
                <ChartContainer symbol={selectedSymbol} />
                <TechnicalIndicators symbol={selectedSymbol} />
              </div>
            )}

            {activeTab === 'scanner' && (
              <SafetyScore symbol={selectedSymbol} />
            )}

            {activeTab === 'signals' && (
              <SignalPanel symbol={selectedSymbol} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}