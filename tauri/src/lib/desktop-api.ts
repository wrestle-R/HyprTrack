import { invoke } from "@tauri-apps/api/core"

import type {
  ActivityData,
  ApplicationsData,
  HealthData,
  OverviewData,
  RangeKey,
  TrackingServiceStatus,
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

export function getTrackingServiceStatus() {
  return invoke<TrackingServiceStatus>("get_tracking_service_status")
}

export function installTrackingService() {
  return invoke<TrackingServiceStatus>("install_tracking_service")
}

export function startTrackingService() {
  return invoke<TrackingServiceStatus>("start_tracking_service")
}

export function restartTrackingService() {
  return invoke<TrackingServiceStatus>("restart_tracking_service")
}

export function uninstallTrackingService() {
  return invoke<TrackingServiceStatus>("uninstall_tracking_service")
}
