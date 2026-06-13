"use client"

import { Database01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { NAVIGATION, isNavActive } from "@/components/layout/nav-config"
import { Badge } from "@/components/ui/badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { useDashboardQuery } from "@/hooks/use-dashboard-query"
import type { HealthData } from "@/lib/dashboard/types"

export function AppSidebar() {
  const pathname = usePathname()
  const { state } = useSidebar()
  const health = useDashboardQuery<HealthData>("/api/health")
  const isConnected = health.data?.status === "connected"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-0 border-b p-3">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-background">
            H
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm font-semibold tracking-tight">
              HyprTrack
            </span>
            <span className="block truncate text-[0.65rem] text-muted-foreground">
              Local activity intelligence
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="pt-3">
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAVIGATION.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isNavActive(pathname, item.href)}
                    tooltip={item.title}
                    className="h-9"
                  >
                    <HugeiconsIcon icon={item.icon} strokeWidth={1.8} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-3 p-3">
        <SidebarSeparator />
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <span
            className="relative flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent"
            title={isConnected ? "Database connected" : "Database unavailable"}
          >
            <HugeiconsIcon icon={Database01Icon} strokeWidth={1.8} />
            <span
              className={`absolute right-0 bottom-0 size-2 rounded-full ring-2 ring-sidebar ${
                isConnected ? "bg-foreground" : "bg-muted-foreground"
              }`}
            />
          </span>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-medium">
                {isConnected ? "Tracking data ready" : "Data unavailable"}
              </span>
              {health.isRefreshing ? (
                <Badge variant="secondary">Refreshing</Badge>
              ) : null}
            </div>
            <p className="truncate text-[0.65rem] text-muted-foreground">
              Read-only local SQLite
            </p>
          </div>
        </div>
        {state === "expanded" && health.data?.latestSampleAt ? (
          <p className="px-1 text-[0.65rem] text-muted-foreground">
            Latest sample{" "}
            {new Date(health.data.latestSampleAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
