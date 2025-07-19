"use client"

import { useState, useEffect, type RefObject } from "react"

interface UseInViewOptions {
  root?: Element | null
  rootMargin?: string
  threshold?: number | number[]
}

export function useInView(ref: RefObject<Element>, options?: UseInViewOptions): boolean {
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Update our state when observer callback fires
        if (entry.isIntersecting) {
          setIsInView(true)
          // No need to observe anymore once it's in view
          if (ref.current) {
            observer.unobserve(ref.current)
          }
        }
      },
      {
        rootMargin: "200px", // Prefetch when the card is 200px away from the viewport
        ...options,
      },
    )

    const currentRef = ref.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [ref, options])

  return isInView
}
