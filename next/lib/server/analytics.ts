import {
  readActivity as readSharedActivity,
  readApplications as readSharedApplications,
  readHealth as readSharedHealth,
  readOverview as readSharedOverview,
} from "../../../shared/dashboard/analytics"
import { openDatabase } from "@/lib/server/database"
import type {
  ActivityData,
  ApplicationsData,
  HealthData,
  OverviewData,
  RangeKey,
} from "@/lib/dashboard/types"

type QueryBase = {
  databasePath?: string
  range: RangeKey
  now?: Date
}

function withOpenDatabase<T>(
  databasePath: string | undefined,
  query: (database: ReturnType<typeof openDatabase>) => T
) {
  const database = openDatabase(databasePath)
  try {
    return query(database)
  } finally {
    database.close()
  }
}

export function readOverview({
  databasePath,
  range,
  now,
}: QueryBase): OverviewData {
  return withOpenDatabase(databasePath, (database) =>
    readSharedOverview({
      database,
      range,
      now,
    })
  )
}

export function readActivity({
  databasePath,
  range,
  app,
  search,
  page,
  pageSize,
  now,
}: QueryBase & {
  app?: string
  search?: string
  page: number
  pageSize: number
}): ActivityData {
  return withOpenDatabase(databasePath, (database) =>
    readSharedActivity({
      database,
      range,
      app,
      search,
      page,
      pageSize,
      now,
    })
  )
}

export function readApplications({
  databasePath,
  range,
  search,
  now,
}: QueryBase & { search?: string }): ApplicationsData {
  return withOpenDatabase(databasePath, (database) =>
    readSharedApplications({
      database,
      range,
      search,
      now,
    })
  )
}

export function readHealth({
  databasePath,
}: {
  databasePath?: string
}): HealthData {
  return withOpenDatabase(databasePath, (database) =>
    readSharedHealth({ database })
  )
}
