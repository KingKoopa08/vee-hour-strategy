'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { utcToZonedTime } from 'date-fns-tz'
import { motion, AnimatePresence } from 'framer-motion'
import { BellAlertIcon } from '@heroicons/react/24/solid'

interface TimeWindow {
  start: string
  end: string
  action: string
  importance: 'HIGH' | 'MEDIUM' | 'LOW'
}

const criticalTimeWindows: TimeWindow[] = [
  { start: '06:03', end: '06:07', action: 'PRIMARY ENTRY WINDOW', importance: 'HIGH' },
  { start: '06:10', end: '06:35', action: 'TARGET SELL WINDOW', importance: 'HIGH' },
  { start: '06:33', end: '06:37', action: 'DIRECTIONAL BIAS', importance: 'HIGH' },
  { start: '07:53', end: '07:57', action: 'BREAKOUT WINDOW', importance: 'HIGH' },
]

export function TimeWindowAlert() {
  const [activeWindow, setActiveWindow] = useState<TimeWindow | null>(null)
  const [timeToNext, setTimeToNext] = useState<string>('')

  useEffect(() => {
    const checkTimeWindows = () => {
      const now = toZonedTime(new Date(), 'America/Denver')
      const currentTime = format(now, 'HH:mm')
      
      const active = criticalTimeWindows.find(window => {
        return currentTime >= window.start && currentTime <= window.end
      })
      
      setActiveWindow(active || null)

      if (!active) {
        const nextWindow = criticalTimeWindows.find(window => currentTime < window.start)
        if (nextWindow) {
          const [hours, minutes] = nextWindow.start.split(':').map(Number)
          const nextTime = new Date(now)
          nextTime.setHours(hours, minutes, 0, 0)
          
          if (nextTime > now) {
            const diff = nextTime.getTime() - now.getTime()
            const minutesUntil = Math.floor(diff / 60000)
            const secondsUntil = Math.floor((diff % 60000) / 1000)
            setTimeToNext(`${minutesUntil}:${secondsUntil.toString().padStart(2, '0')}`)
          }
        }
      }
    }

    checkTimeWindows()
    const interval = setInterval(checkTimeWindows, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <AnimatePresence>
      {activeWindow && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`mb-4 p-4 rounded-lg border-2 ${
            activeWindow.importance === 'HIGH' 
              ? 'bg-red-900/20 border-trading-red animate-pulse' 
              : 'bg-yellow-900/20 border-trading-yellow'
          }`}
        >
          <div className="flex items-center space-x-3">
            <BellAlertIcon className="w-6 h-6 text-trading-yellow" />
            <div>
              <p className="font-bold text-lg">{activeWindow.action}</p>
              <p className="text-sm text-gray-400">
                Active until {activeWindow.end} MT
              </p>
            </div>
          </div>
        </motion.div>
      )}
      
      {!activeWindow && timeToNext && (
        <div className="mb-4 p-2 bg-trading-gray rounded-lg text-center text-sm">
          Next critical window in: <span className="font-mono font-bold text-trading-yellow">{timeToNext}</span>
        </div>
      )}
    </AnimatePresence>
  )
}