"use client"

import { RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { usePathname } from "next/navigation"

import { useDashboard } from "@/components/dashboard/dashboard-provider"
import { RangeControl } from "@/components/layout/range-control"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { getPageTitle } from "@/components/layout/nav-config"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function AppHeader() {
  const pathname = usePathname()
  const { requestRefresh, refreshRequestedAt } = useDashboard()
  const isSettings = pathname === "/settings"

  return (
    <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="truncate font-medium">
              {getPageTitle(pathname)}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-2">
        {isSettings ? null : <RangeControl />}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={requestRefresh}
          title={
            refreshRequestedAt
              ? `Last requested ${refreshRequestedAt.toLocaleTimeString()}`
              : "Refresh dashboard data"
          }
        >
          <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  )
}
