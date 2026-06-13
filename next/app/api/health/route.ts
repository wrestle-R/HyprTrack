import { readHealth } from "@/lib/server/analytics"
import { jsonResponse, routeError } from "@/lib/server/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return jsonResponse(readHealth({}))
  } catch (error) {
    return routeError(error)
  }
}
