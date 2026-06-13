export type DashboardErrorCode =
  | "INVALID_QUERY"
  | "DATABASE_MISSING"
  | "INVALID_SCHEMA"
  | "QUERY_FAILED"

export class DashboardDataError extends Error {
  constructor(
    public readonly code: DashboardErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = "DashboardDataError"
  }
}
