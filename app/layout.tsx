import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { cn } from "@/lib/utils"
import { Inter, Instrument_Sans } from "next/font/google"
import { Providers } from "./providers"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const instrument_sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
})

export const metadata: Metadata = {
  title: "Bookmark Manager",
  description: "A modern, minimalist bookmark management application.",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased dark",
          inter.variable,
          instrument_sans.variable,
        )}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
