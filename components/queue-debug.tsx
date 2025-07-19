"use client"

import { useRequestQueue } from "@/hooks/use-request-queue"
import { useEffect, useState } from "react"

export function QueueDebug() {
  const { getQueueStats } = useRequestQueue()
  const [stats, setStats] = useState({ queueSize: 0, activeRequests: 0, maxConcurrent: 0 })

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(getQueueStats())
    }, 500) // Update every 500ms

    return () => clearInterval(interval)
  }, [getQueueStats])

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 bg-black/80 text-white text-xs p-2 rounded font-mono z-50">
      <div>Queue: {stats.queueSize}</div>
      <div>Active: {stats.activeRequests}/{stats.maxConcurrent}</div>
    </div>
  )
} 