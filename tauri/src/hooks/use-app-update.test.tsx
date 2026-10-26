import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { checkAppUpdate, getAppInfo, installAppUpdate, subscribeUpdateProgress } from "../lib/app-update"
import { useAppUpdate } from "./use-app-update"

vi.mock("../lib/app-update", () => ({ getAppInfo: vi.fn(), checkAppUpdate: vi.fn(), installAppUpdate: vi.fn(), subscribeUpdateProgress: vi.fn() }))

describe("app updates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAppInfo).mockResolvedValue({ version: "2.2.0", updateSupported: true })
    vi.mocked(checkAppUpdate).mockResolvedValue("2.3.0")
    vi.mocked(subscribeUpdateProgress).mockResolvedValue(() => undefined)
  })

  it("checks on startup and keeps a discovered update across a failed recheck", async () => {
    const { result } = renderHook(useAppUpdate)
    await waitFor(() => expect(result.current.availableVersion).toBe("2.3.0"))
    expect(result.current.info.version).toBe("2.2.0")
    vi.mocked(checkAppUpdate).mockRejectedValue(new Error("offline"))
    await act(async () => { await result.current.check() })
    expect(result.current.availableVersion).toBe("2.3.0")
    expect(result.current.error).toContain("offline")
  })

  it("deduplicates install clicks and stays busy until the process restarts", async () => {
    let resolve: (value: string) => void = () => undefined
    vi.mocked(installAppUpdate).mockReturnValue(new Promise((done) => { resolve = done }))
    const { result } = renderHook(useAppUpdate)
    await waitFor(() => expect(result.current.availableVersion).toBe("2.3.0"))
    let installation: Promise<void> = Promise.resolve()
    act(() => { installation = result.current.install(); void result.current.install() })
    await waitFor(() => expect(installAppUpdate).toHaveBeenCalledTimes(1))
    await act(async () => { resolve("restarting"); await installation })
    expect(result.current.busy).toBe(true)
    expect(result.current.progress?.phase).toBe("restarting")
    await act(async () => { await result.current.install() })
    expect(installAppUpdate).toHaveBeenCalledTimes(1)
  })

  it("supports a retry after installation failure without clearing the available version", async () => {
    vi.mocked(installAppUpdate).mockRejectedValue(new Error("bad signature"))
    const { result } = renderHook(useAppUpdate)
    await waitFor(() => expect(result.current.availableVersion).toBe("2.3.0"))
    await act(async () => { await result.current.install() })
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toContain("bad signature")
    expect(result.current.availableVersion).toBe("2.3.0")
    vi.mocked(installAppUpdate).mockResolvedValue("current")
    await act(async () => { await result.current.install() })
    expect(result.current.availableVersion).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
