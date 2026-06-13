import type { RangeKey } from "@/lib/dashboard/types"
import { isRangeKey } from "@/lib/dashboard/ranges"
import {
  DashboardDataError,
  type DashboardErrorCode,
} from "@/lib/server/errors"

const ERROR_STATUS: Record<DashboardErrorCode, number> = {
  INVALID_QUERY: 400,
  DATABASE_MISSING: 404,
  INVALID_SCHEMA: 422,
  QUERY_FAILED: 500,
}
const ERROR_MESSAGE: Record<DashboardErrorCode, string> = {
  INVALID_QUERY: "The request query is invalid.",
  DATABASE_MISSING: "The activity database is unavailable.",
  INVALID_SCHEMA: "The activity database schema is not supported.",
  QUERY_FAILED: "The activity data could not be loaded.",
}

export function parseRange(params: URLSearchParams): RangeKey {
  const value = params.get("range") ?? "today"
  if (!isRangeKey(value)) {
    throw new DashboardDataError("INVALID_QUERY", ERROR_MESSAGE.INVALID_QUERY)
  }
  return value
}

export function parseOptionalText(
  params: URLSearchParams,
  key: string,
  maxLength = 100
) {
  const value = params.get(key)?.trim() ?? ""
  if (value.length > maxLength) {
    throw new DashboardDataError("INVALID_QUERY", ERROR_MESSAGE.INVALID_QUERY)
  }
  return value
}

export function parsePositiveInteger(
  params: URLSearchParams,
  key: string,
  fallback: number,
  maximum: number
) {
  const raw = params.get(key)
  if (raw === null) {
    return fallback
  }

  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new DashboardDataError("INVALID_QUERY", ERROR_MESSAGE.INVALID_QUERY)
  }
  return value
}

export function jsonResponse(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set("Cache-Control", "no-store")

  return Response.json(data, { ...init, headers })
}

export function routeError(error: unknown) {
  const dataError =
    error instanceof DashboardDataError
      ? error
      : new DashboardDataError(
          "QUERY_FAILED",
          ERROR_MESSAGE.QUERY_FAILED,
          { cause: error }
        )

  return jsonResponse(
    {
      error: {
        code: dataError.code,
        message: ERROR_MESSAGE[dataError.code],
      },
    },
    { status: ERROR_STATUS[dataError.code] }
  )
}
