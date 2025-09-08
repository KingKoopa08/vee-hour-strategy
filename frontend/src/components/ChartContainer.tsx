'use client'

import { useEffect, useRef } from 'react'
import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts'
import { useStockData } from '@/hooks/useStockData'

interface ChartContainerProps {
  symbol: string
}

export function ChartContainer({ symbol }: ChartContainerProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  
  const { priceData, indicators } = useStockData(symbol)

  useEffect(() => {
    if (!chartContainerRef.current) return

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#ffffff',
      },
      grid: {
        vertLines: { color: '#333333' },
        horzLines: { color: '#333333' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
      timeScale: {
        timeVisible: true,
        borderColor: '#333333',
      },
      rightPriceScale: {
        borderColor: '#333333',
      },
    })

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#00ff88',
      downColor: '#ff3366',
      borderUpColor: '#00ff88',
      borderDownColor: '#ff3366',
      wickUpColor: '#00ff88',
      wickDownColor: '#ff3366',
    })

    const vwapSeries = chart.addLineSeries({
      color: '#ff00ff',
      lineWidth: 2,
      title: 'VWAP',
    })

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    })

    chartRef.current = chart
    candlestickSeriesRef.current = candlestickSeries
    vwapSeriesRef.current = vwapSeries
    volumeSeriesRef.current = volumeSeries

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  useEffect(() => {
    if (priceData && candlestickSeriesRef.current) {
      const candleData = priceData.map(d => ({
        time: d.timestamp as any,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }))
      candlestickSeriesRef.current.setData(candleData)

      if (volumeSeriesRef.current) {
        const volumeData = priceData.map(d => ({
          time: d.timestamp as any,
          value: d.volume,
          color: d.close >= d.open ? '#00ff8844' : '#ff336644',
        }))
        volumeSeriesRef.current.setData(volumeData)
      }
    }
  }, [priceData])

  useEffect(() => {
    if (indicators && vwapSeriesRef.current && priceData) {
      const vwapData = priceData.map(d => ({
        time: d.timestamp as any,
        value: indicators.vwap,
      }))
      vwapSeriesRef.current.setData(vwapData)
    }
  }, [indicators, priceData])

  return (
    <div className="bg-black rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold">{symbol} - Live Chart</h3>
        <div className="flex space-x-4 text-sm">
          <span className="text-trading-green">VWAP: ${indicators?.vwap.toFixed(2)}</span>
          <span className={indicators?.rsi > 70 ? 'text-trading-red' : indicators?.rsi < 30 ? 'text-trading-green' : 'text-white'}>
            RSI: {indicators?.rsi.toFixed(2)}
          </span>
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full" />
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="bg-trading-gray p-2 rounded">
          <p className="text-gray-400">Volume Ratio</p>
          <p className="text-lg font-bold">{indicators?.volumeRatio.toFixed(2)}x</p>
        </div>
        <div className="bg-trading-gray p-2 rounded">
          <p className="text-gray-400">Price vs VWAP</p>
          <p className={`text-lg font-bold ${priceData?.[priceData.length - 1]?.close > indicators?.vwap ? 'text-trading-green' : 'text-trading-red'}`}>
            {((priceData?.[priceData.length - 1]?.close - indicators?.vwap) / indicators?.vwap * 100).toFixed(2)}%
          </p>
        </div>
        <div className="bg-trading-gray p-2 rounded">
          <p className="text-gray-400">Bollinger Position</p>
          <p className="text-lg font-bold">
            {priceData?.[priceData.length - 1]?.close > indicators?.bollingerBands.upper ? 'Above Upper' :
             priceData?.[priceData.length - 1]?.close < indicators?.bollingerBands.lower ? 'Below Lower' : 'Middle'}
          </p>
        </div>
      </div>
    </div>
  )
}