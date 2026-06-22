import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { useDesktopQuery } from "./use-desktop-query"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe("useDesktopQuery", () => {
  it("shows loading and clears incompatible data when the query scope changes", async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const { result, rerender } = renderHook(
      ({ scope, refresh }) =>
        useDesktopQuery(
          () => (scope === "today" ? first.promise : second.promise),
          [scope, refresh],
          scope
        ),
      { initialProps: { scope: "today", refresh: 0 } }
    )

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()

    await act(async () => first.resolve("today data"))
    expect(result.current.data).toBe("today data")

    rerender({ scope: "7d", refresh: 0 })

    expect(result.current.loading).toBe(true)
    expect(result.current.refreshing).toBe(false)
    expect(result.current.data).toBeNull()

    await act(async () => second.resolve("week data"))
    expect(result.current.data).toBe("week data")
  })

  it("keeps same-scope data visible during a background refresh", async () => {
    const first = deferred<string>()
    const refreshRequest = deferred<string>()
    const { result, rerender } = renderHook(
      ({ refresh }) =>
        useDesktopQuery(
          () => (refresh === 0 ? first.promise : refreshRequest.promise),
          [refresh],
          "today"
        ),
      { initialProps: { refresh: 0 } }
    )

    await act(async () => first.resolve("initial data"))
    rerender({ refresh: 1 })

    await waitFor(() => expect(result.current.refreshing).toBe(true))
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBe("initial data")

    await act(async () => refreshRequest.resolve("updated data"))
    expect(result.current.refreshing).toBe(false)
    expect(result.current.data).toBe("updated data")
  })

  it("preserves stale data and reports an error when a refresh fails", async () => {
    const first = deferred<string>()
    const refreshRequest = deferred<string>()
    const { result, rerender } = renderHook(
      ({ refresh }) =>
        useDesktopQuery(
          () => (refresh === 0 ? first.promise : refreshRequest.promise),
          [refresh],
          "today"
        ),
      { initialProps: { refresh: 0 } }
    )

    await act(async () => first.resolve("initial data"))
    rerender({ refresh: 1 })
    await act(async () => refreshRequest.reject(new Error("database busy")))

    expect(result.current.data).toBe("initial data")
    expect(result.current.error).toBe("database busy")
    expect(result.current.loading).toBe(false)
    expect(result.current.refreshing).toBe(false)
  })
})
