import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useMarketData() {
  const { data: topVolume = [] } = useQuery({
    queryKey: ['topVolume'],
    queryFn: api.getTopVolume,
    refetchInterval: 60000,
  })

  const { data: marketStatus = 'closed' } = useQuery({
    queryKey: ['marketStatus'],
    queryFn: api.getMarketStatus,
    refetchInterval: 30000,
  })

  return {
    topVolume,
    marketStatus
  }
}