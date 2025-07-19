"use client"

import { useCallback, useRef } from 'react'

type QueueItem<T> = {
  id: string
  request: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: any) => void
}

class RequestQueue {
  private queue: QueueItem<any>[] = []
  private activeRequests = 0
  private maxConcurrent: number

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent
  }

  async enqueue<T>(id: string, request: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Check if request with same ID already exists in queue
      const existingIndex = this.queue.findIndex(item => item.id === id)
      if (existingIndex !== -1) {
        // Replace existing request with new one
        this.queue[existingIndex] = { id, request, resolve, reject }
        return
      }

      this.queue.push({ id, request, resolve, reject })
      this.processQueue()
    })
  }

  private async processQueue() {
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return
    }

    const item = this.queue.shift()
    if (!item) return

    this.activeRequests++

    try {
      const result = await item.request()
      item.resolve(result)
    } catch (error) {
      item.reject(error)
    } finally {
      this.activeRequests--
      // Process next item in queue
      setTimeout(() => this.processQueue(), 0)
    }
  }

  clear() {
    // Reject all pending requests
    this.queue.forEach(item => {
      item.reject(new Error('Request queue cleared'))
    })
    this.queue = []
  }

  getStats() {
    return {
      queueSize: this.queue.length,
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrent
    }
  }
}

// Global request queue instance
let globalQueue: RequestQueue | null = null

export function useRequestQueue(maxConcurrent = 3) {
  const queueRef = useRef<RequestQueue>()

  if (!queueRef.current) {
    // Use global queue or create new one
    if (!globalQueue) {
      globalQueue = new RequestQueue(maxConcurrent)
    }
    queueRef.current = globalQueue
  }

  const enqueueRequest = useCallback(
    <T>(id: string, request: () => Promise<T>): Promise<T> => {
      return queueRef.current!.enqueue(id, request)
    },
    []
  )

  const clearQueue = useCallback(() => {
    queueRef.current?.clear()
  }, [])

  const getQueueStats = useCallback(() => {
    return queueRef.current?.getStats() || { queueSize: 0, activeRequests: 0, maxConcurrent: 0 }
  }, [])

  return {
    enqueueRequest,
    clearQueue,
    getQueueStats
  }
} 