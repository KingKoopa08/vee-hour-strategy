'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { toZonedTimeToUtc, utcToZonedTime } from 'date-fns-tz'

interface HeaderProps {
  marketStatus: string
  isConnected: boolean
}

export function Header({ marketStatus, isConnected }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const mountainTime = utcToZonedTime(currentTime, 'America/Denver')

  return (
    <header className="bg-trading-gray border-b border-gray-800">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gradient">
              Trading Analysis Platform
            </h1>
            <p className="text-sm text-gray-400">VEE/HOUR/ISPC Strategy</p>
          </div>
          
          <div className="text-right">
            <div className="text-lg font-mono">
              {format(mountainTime, 'HH:mm:ss')} MT
            </div>
            <div className="text-sm text-gray-400">
              {format(mountainTime, 'MMM dd, yyyy')}
            </div>
            <div className="flex items-center space-x-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${
                marketStatus === 'open' ? 'bg-trading-green' : 'bg-trading-red'
              }`} />
              <span className="text-sm">
                Market {marketStatus === 'open' ? 'Open' : 'Closed'}
              </span>
              <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-trading-green animate-pulse' : 'bg-trading-red'
              }`} />
              <span className="text-sm">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}