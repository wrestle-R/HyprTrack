"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useDashboard } from "@/components/dashboard/dashboard-provider"
import type { RangeKey } from "@/lib/dashboard/types"

const OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
]

export function RangeControl() {
  const { range, setRange } = useDashboard()

  return (
    <ToggleGroup
      aria-label="Dashboard date range"
      value={[range]}
      onValueChange={(values) => {
        const value = values[0] as RangeKey | undefined
        if (value) {
          setRange(value)
        }
      }}
      variant="outline"
      size="sm"
      spacing={0}
    >
      {OPTIONS.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
