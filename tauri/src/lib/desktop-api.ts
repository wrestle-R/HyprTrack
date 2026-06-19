import { invoke } from "@tauri-apps/api/core"

import type {
  ActivityData,
  ApplicationsData,
  HealthData,
  OverviewData,
  RangeKey,
} from "./types"
import type { MappingRule } from "./mappings"

export function getOverview(range: RangeKey, mappingRules: MappingRule[]) {
  return invoke<OverviewData>("get_overview", { range, mappingRules })
}

export function getActivity(args: {
  range: RangeKey
  page: number
  pageSize: number
  app?: string
  search?: string
  mappingRules: MappingRule[]
}) {
  return invoke<ActivityData>("get_activity", {
    range: args.range,
    page: args.page,
    pageSize: args.pageSize,
    app: args.app ?? null,
    search: args.search ?? null,
    mappingRules: args.mappingRules,
  })
}

export function getApplications(
  range: RangeKey,
  mappingRules: MappingRule[],
  search?: string
) {
  return invoke<ApplicationsData>("get_applications", {
    range,
    search: search ?? null,
    mappingRules,
  })
}

export function getHealth() {
  return invoke<HealthData>("get_health")
}
