import { readActivity } from "@/lib/server/analytics"
import {
  jsonResponse,
  parseOptionalText,
  parsePositiveInteger,
  parseRange,
  routeError,
} from "@/lib/server/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    return jsonResponse(
      readActivity({
        range: parseRange(params),
        app: parseOptionalText(params, "app", 80),
        search: parseOptionalText(params, "search"),
        page: parsePositiveInteger(params, "page", 1, 100_000),
        pageSize: parsePositiveInteger(params, "pageSize", 20, 100),
      })
    )
  } catch (error) {
    return routeError(error)
  }
}
