import { readOverview } from "@/lib/server/analytics"
import { jsonResponse, parseRange, routeError } from "@/lib/server/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    return jsonResponse(readOverview({ range: parseRange(params) }))
  } catch (error) {
    return routeError(error)
  }
}
