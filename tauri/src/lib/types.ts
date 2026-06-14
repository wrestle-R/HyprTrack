export type {
  ActivityData,
  ActivitySession,
  ApplicationUsage,
  ApplicationsData,
  HealthData,
  OverviewData,
  RangeKey,
} from "../../../shared/dashboard/types"

export type DesktopPage = "overview" | "activity" | "applications" | "settings"

export type CollectorState =
  | "stopped"
  | "running_app"
  | "running_external"
  | "error"

export type CollectorStatus = {
  state: CollectorState
  dbPath: string
  latestSampleAt: string | null
  pid: number | null
  managedByApp: boolean
  message: string
}

export type AutostartStatus = {
  enabled: boolean
}
