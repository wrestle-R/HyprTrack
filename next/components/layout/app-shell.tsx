"use client"

import * as React from "react"

import {
  DashboardProvider,
  useDashboard,
} from "@/components/dashboard/dashboard-provider"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
  FONT_SIZE_PIXELS,
  SIDEBAR_WIDTH_PIXELS,
} from "@/lib/dashboard/preferences"

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { preferences } = useDashboard()

  React.useEffect(() => {
    document.documentElement.style.fontSize =
      FONT_SIZE_PIXELS[preferences.fontSize]

    return () => {
      document.documentElement.style.removeProperty("font-size")
    }
  }, [preferences.fontSize])

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": SIDEBAR_WIDTH_PIXELS[preferences.sidebarWidth],
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardProvider>
  )
}
