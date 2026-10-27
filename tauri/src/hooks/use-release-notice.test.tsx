import { StrictMode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, expect, it } from "vitest"
import { PREFERENCES_KEY } from "../lib/preferences"
import { consumeReleaseNotice, RELEASE_VERSION_KEY, useReleaseNotice } from "./use-release-notice"

beforeEach(() => localStorage.clear())

it("shows only releases actually crossed, then consumes that upgrade once", () => {
  localStorage.setItem(RELEASE_VERSION_KEY, "2.2.1")
  expect(consumeReleaseNotice("2.2.2", localStorage)?.releases.map(r => r.version)).toEqual(["2.2.2"])
  expect(consumeReleaseNotice("2.2.2", localStorage)).toBeNull()
  expect(consumeReleaseNotice("2.2.1", localStorage)).toBeNull()
  expect(localStorage.getItem(RELEASE_VERSION_KEY)).toBe("2.2.2")
})

it("includes each skipped update but excludes older and future notes", () => {
  localStorage.setItem(RELEASE_VERSION_KEY, "2.1.0")
  expect(consumeReleaseNotice("2.2.2", localStorage)?.releases.map(r => r.version)).toEqual(["2.2.2", "2.2.1"])
})

it("initializes fresh installs quietly and migrates existing unversioned installs with only current notes", () => {
  expect(consumeReleaseNotice("2.2.2", localStorage)).toBeNull()
  localStorage.clear()
  localStorage.setItem(PREFERENCES_KEY, "{}")
  expect(consumeReleaseNotice("2.2.2", localStorage)?.releases.map(r => r.version)).toEqual(["2.2.2"])
  expect(consumeReleaseNotice("2.2.2", localStorage)).toBeNull()
})

it("recognizes existing activity even when the user never saved custom preferences", () => {
  expect(consumeReleaseNotice("2.2.2", localStorage, true)?.releases.map(r => r.version)).toEqual(["2.2.2"])
})

it("does not break startup or repeat notes when storage is blocked", () => {
  const blocked = { getItem() { throw Error("blocked") } } as unknown as Storage
  expect(consumeReleaseNotice("2.2.2", blocked)).toBeNull()
})

it("survives StrictMode, dismisses, and does not reopen after remount", async () => {
  localStorage.setItem(RELEASE_VERSION_KEY, "2.2.1")
  const { result, rerender, unmount } = renderHook(({ version }) => useReleaseNotice(version), {
    initialProps: { version: null as string | null }, wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
  })
  expect(result.current.notice).toBeNull()
  rerender({ version: "2.2.2" })
  await waitFor(() => expect(result.current.notice?.version).toBe("2.2.2"))
  act(() => result.current.dismiss())
  expect(result.current.notice).toBeNull()
  unmount()
  const again = renderHook(() => useReleaseNotice("2.2.2"))
  expect(again.result.current.notice).toBeNull()
})
