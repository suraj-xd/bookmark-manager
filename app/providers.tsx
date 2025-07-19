"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import type React from "react"
import { useState } from "react"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cache data for 7 days
            staleTime: 1000 * 60 * 60 * 24 * 7,
            gcTime: 1000 * 60 * 60 * 24 * 7,
            // Don't refetch on window focus or reconnect
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            // Retry failed requests with exponential backoff
            retry: 2,
            retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
