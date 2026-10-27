import { render, screen, cleanup } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import type { AppUpdateState } from "../hooks/use-app-update"
import { UpdateControl } from "./app-updates"

afterEach(cleanup)
const state = (availableVersion: string | null): AppUpdateState => ({
  info: { version: "2.2.2", updateSupported: true }, infoLoaded: true,
  availableVersion, checking: false, busy: false, checked: true, error: null, progress: null,
  check: vi.fn(), install: vi.fn(),
})

it("shows a top-bar button only for an available update", () => {
  const { rerender } = render(<UpdateControl update={state(null)} compact />)
  expect(screen.queryByRole("button")).toBeNull()
  rerender(<UpdateControl update={state("2.2.3")} compact />)
  expect(screen.getByRole("button", { name: "Update to v2.2.3" })).toBeTruthy()
  rerender(<UpdateControl update={state(null)} compact />)
  expect(screen.queryByRole("button")).toBeNull()
})

it("keeps the installed version and manual check in Settings when current", () => {
  render(<UpdateControl update={state(null)} />)
  expect(screen.getByText("v2.2.2")).toBeTruthy()
  expect(screen.getByRole("button", { name: "Check for updates" })).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Install & restart" })).toBeNull()
})
