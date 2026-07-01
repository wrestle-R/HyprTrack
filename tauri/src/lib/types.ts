export type RangeKey = "today" | "7d" | "30d"

export type EffectiveRange = {
  key: RangeKey
  start: string
  end: string
  label: string
}

export type ActivitySession = {
  startAt: string
  endAt: string
  appClass: string
  windowTitle: string
  durationMinutes: number
  sampleCount: number
}

export type ApplicationUsage = {
  windowTitle: string
  appClass: string
  minutes: number
  share: number
  sessionCount: number
  firstSeen: string
  lastSeen: string
  recentSessions: ActivitySession[]
}

export type TimelinePoint = {
  bucket: string
  label: string
  minutes: number
  topApplications: ApplicationUsage[]
}

export type FocusQuality = {
  focusedMinutes: number
  continuityPercent: number
  longestFocusedBlockMinutes: number
  averageSessionMinutes: number
  contextSwitches: number
  switchesPerTrackedHour: number
}

export type ComparisonValue = {
  current: number
  previous: number
  percentChange: number | null
}

export type RhythmCell = {
  dayIndex: number
  dayLabel: string
  hour: number
  trackedMinutes: number
  focusedMinutes: number
}

export type DailyInsightPoint = {
  bucket: string
  label: string
  trackedMinutes: number
  focusedMinutes: number
}

export type InsightsData = {
  range: EffectiveRange
  comparisons: {
    trackedMinutes: ComparisonValue
    averageTrackedMinutesPerActiveDay: ComparisonValue
    focusContinuity: ComparisonValue
    averageSessionMinutes: ComparisonValue
    switchesPerTrackedHour: ComparisonValue
  }
  rhythm: RhythmCell[]
  dailyTrend: DailyInsightPoint[]
  highlights: {
    peakWorkingWindow: string | null
    strongestFocusDay: string | null
    mostFragmentedDay: string | null
    longestFocusedBlockMinutes: number
  }
}

export type OverviewData = {
  range: EffectiveRange
  trackedMinutes: number
  averageTrackedMinutes: number
  topApplication: ApplicationUsage | null
  streakDays: number
  timeline: TimelinePoint[]
  applications: ApplicationUsage[]
  recentSessions: ActivitySession[]
  focusQuality: FocusQuality
  latestSampleAt: string | null
}

export type ActivityData = {
  range: EffectiveRange
  sessions: ActivitySession[]
  appClasses: string[]
  lastHourCoverage: {
    trackedMinutes: number
    untrackedMinutes: number
    coveragePercent: number
    windowStart: string
    windowEnd: string
  }
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export type ApplicationsData = {
  range: EffectiveRange
  items: ApplicationUsage[]
}

export type HealthData = {
  status: "connected"
  sampleCount: number
  latestSampleAt: string | null
}

export type DesktopPage =
  | "overview"
  | "insights"
  | "applications"
  | "activity"
  | "mappings"
  | "settings"
  | "keybindings"
