import { invoke } from "@tauri-apps/api/core"

import type {
  ActivityData,
  ApplicationsData,
  AutostartStatus,
  CollectorStatus,
  HealthData,
  OverviewData,
  RangeKey,
} from "./types"

export function getOverview(range: RangeKey) {
  return invoke<OverviewData>("get_overview", { range })
}

export function getActivity(args: {
  range: RangeKey
  page: number
  pageSize: number
  app?: string
  search?: string
}) {
  return invoke<ActivityData>("get_activity", {
    range: args.range,
    page: args.page,
    pageSize: args.pageSize,
    app: args.app ?? null,
    search: args.search ?? null,
  })
}

export function getApplications(range: RangeKey, search?: string) {
  return invoke<ApplicationsData>("get_applications", {
    range,
    search: search ?? null,
  })
}

export function getHealth() {
  return invoke<HealthData>("get_health")
}

export function getCollectorStatus() {
  return invoke<CollectorStatus>("get_collector_status")
}

export function startCollector() {
  return invoke<CollectorStatus>("start_collector")
}

export function stopCollector() {
  return invoke<CollectorStatus>("stop_collector")
}

export function restartCollector() {
  return invoke<CollectorStatus>("restart_collector")
}

export function getAutostartStatus() {
  return invoke<AutostartStatus>("get_autostart_status")
}

export function setAutostart(enabled: boolean) {
  return invoke<AutostartStatus>("set_autostart", { enabled })
}
