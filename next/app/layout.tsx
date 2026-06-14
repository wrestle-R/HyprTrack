import type { Metadata } from "next"
import { JetBrains_Mono, Merriweather, Outfit } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppShell } from "@/components/layout/app-shell"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const fontSans = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontSerif = Merriweather({
  subsets: ["latin"],
  variable: "--font-serif",
})

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: {
    default: "HyprTrack",
    template: "%s | HyprTrack",
  },
  description: "Private, local-first activity analytics for Hyprland.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "font-sans antialiased",
        fontSans.variable,
        fontSerif.variable,
        fontMono.variable
      )}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
