"use client"

import * as React from "react"
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"

import { useDashboard } from "@/components/dashboard/dashboard-provider"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const { updatePreferences } = useDashboard()
  const mounted = React.useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  )
  const isDark = mounted && resolvedTheme === "dark"

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={
        mounted
          ? isDark
            ? "Use light theme"
            : "Use dark theme"
          : "Toggle theme"
      }
      onClick={() => {
        const theme = isDark ? "light" : "dark"
        setTheme(theme)
        updatePreferences({ theme })
      }}
    >
      <HugeiconsIcon
        icon={isDark ? Sun03Icon : Moon02Icon}
        strokeWidth={1.8}
      />
    </Button>
  )
}
