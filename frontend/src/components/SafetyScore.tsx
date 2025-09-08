'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { CheckCircleIcon, XCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid'

interface SafetyScoreProps {
  symbol: string
}

export function SafetyScore({ symbol }: SafetyScoreProps) {
  const { data: safety, loading } = useQuery({
    queryKey: ['safety', symbol],
    queryFn: () => api.getSafetyScore(symbol),
    refetchInterval: 300000, // 5 minutes
  })

  if (loading || !safety) {
    return (
      <div className="bg-trading-gray rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-32 bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  const getScoreColor = (score: number) => {
    if (score >= 7) return 'text-trading-green'
    if (score >= 5) return 'text-trading-yellow'
    return 'text-trading-red'
  }

  const getRecommendationIcon = (recommendation: string) => {
    switch (recommendation) {
      case 'SAFE':
        return <CheckCircleIcon className="w-8 h-8 text-trading-green" />
      case 'MODERATE':
        return <ExclamationCircleIcon className="w-8 h-8 text-trading-yellow" />
      case 'RISKY':
        return <XCircleIcon className="w-8 h-8 text-trading-red" />
      default:
        return null
    }
  }

  return (
    <div className="bg-trading-gray rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold">Safety Analysis for {symbol}</h3>
        <div className="flex items-center space-x-3">
          {getRecommendationIcon(safety.recommendation)}
          <div>
            <p className={`text-2xl font-bold ${getScoreColor(safety.overallScore)}`}>
              {safety.overallScore.toFixed(1)}/10
            </p>
            <p className="text-sm text-gray-400">{safety.recommendation}</p>
          </div>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-trading-dark p-4 rounded">
            <p className="text-xs text-gray-400 mb-2">Market Cap</p>
            <div className="flex items-center justify-between">
              <span className={`text-lg font-bold ${getScoreColor(safety.marketCapScore)}`}>
                {safety.marketCapScore.toFixed(1)}
              </span>
              <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-trading-green"
                  style={{ width: `${safety.marketCapScore * 10}%` }}
                />
              </div>
            </div>
          </div>
          
          <div className="bg-trading-dark p-4 rounded">
            <p className="text-xs text-gray-400 mb-2">P/E Ratio</p>
            <div className="flex items-center justify-between">
              <span className={`text-lg font-bold ${getScoreColor(safety.peRatioScore)}`}>
                {safety.peRatioScore.toFixed(1)}
              </span>
              <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-trading-green"
                  style={{ width: `${safety.peRatioScore * 10}%` }}
                />
              </div>
            </div>
          </div>
          
          <div className="bg-trading-dark p-4 rounded">
            <p className="text-xs text-gray-400 mb-2">Volume</p>
            <div className="flex items-center justify-between">
              <span className={`text-lg font-bold ${getScoreColor(safety.volumeScore)}`}>
                {safety.volumeScore.toFixed(1)}
              </span>
              <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-trading-green"
                  style={{ width: `${safety.volumeScore * 10}%` }}
                />
              </div>
            </div>
          </div>
          
          <div className="bg-trading-dark p-4 rounded">
            <p className="text-xs text-gray-400 mb-2">Technical</p>
            <div className="flex items-center justify-between">
              <span className={`text-lg font-bold ${getScoreColor(safety.technicalScore)}`}>
                {safety.technicalScore.toFixed(1)}
              </span>
              <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-trading-green"
                  style={{ width: `${safety.technicalScore * 10}%` }}
                />
              </div>
            </div>
          </div>
          
          <div className="bg-trading-dark p-4 rounded">
            <p className="text-xs text-gray-400 mb-2">News</p>
            <div className="flex items-center justify-between">
              <span className={`text-lg font-bold ${getScoreColor(safety.newsScore)}`}>
                {safety.newsScore.toFixed(1)}
              </span>
              <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-trading-green"
                  style={{ width: `${safety.newsScore * 10}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="bg-trading-dark p-4 rounded">
          <p className="text-sm text-gray-400 mb-2">Safety Assessment</p>
          <div className="space-y-2">
            {safety.overallScore >= 7 && (
              <p className="text-trading-green">
                ✓ This stock shows strong safety metrics and is suitable for trading
              </p>
            )}
            {safety.overallScore >= 5 && safety.overallScore < 7 && (
              <p className="text-trading-yellow">
                ⚠ This stock has moderate risk. Trade with caution and smaller positions
              </p>
            )}
            {safety.overallScore < 5 && (
              <p className="text-trading-red">
                ✗ High risk detected. Consider avoiding or use very tight stop losses
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}