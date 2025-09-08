'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            refetchInterval: 10000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    []
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}