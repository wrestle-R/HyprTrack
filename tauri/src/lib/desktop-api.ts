import { invoke } from "@tauri-apps/api/core"

import type {
  ActivityData,
  ApplicationsData,
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
