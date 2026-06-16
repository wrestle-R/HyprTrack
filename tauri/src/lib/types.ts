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
}

export type OverviewData = {
  range: EffectiveRange
  trackedMinutes: number
  topApplication: ApplicationUsage | null
  streakDays: number
  timeline: TimelinePoint[]
  applications: ApplicationUsage[]
  recentSessions: ActivitySession[]
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

export type DesktopPage = "overview" | "activity" | "applications" | "settings"
export type TrackingServiceState =
  | "running"
  | "stopped"
  | "starting"
  | "restarting"
  | "failed"

export type TrackingServiceStatus = {
  state: TrackingServiceState
  pid: number | null
  message: string
  lastError: string | null
  journalExcerpt: string[]
  installed: boolean
  enabled: boolean
}
