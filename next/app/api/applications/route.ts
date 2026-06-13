import { readApplications } from "@/lib/server/analytics"
import {
  jsonResponse,
  parseOptionalText,
  parseRange,
  routeError,
} from "@/lib/server/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    return jsonResponse(
      readApplications({
        range: parseRange(params),
        search: parseOptionalText(params, "search"),
      })
    )
  } catch (error) {
    return routeError(error)
  }
}
