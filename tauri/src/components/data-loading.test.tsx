import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  DataPageSkeleton,
  InlineListSkeleton,
  RefreshStatus,
} from "./data-loading"

describe("data loading components", () => {
  it("renders an accessible page skeleton", () => {
    const { container } = render(<DataPageSkeleton variant="overview" />)

    expect(screen.getByRole("status")).toHaveTextContent("Loading data")
    expect(container.querySelector("[aria-busy='true']")).toBeInTheDocument()
    expect(container.querySelectorAll(".skeleton-block").length).toBeGreaterThan(4)
  })

  it("renders an inline loader for settings lists", () => {
    const { container } = render(<InlineListSkeleton />)

    expect(screen.getByRole("status")).toHaveTextContent("Loading applications")
    expect(container.querySelectorAll(".skeleton-row")).toHaveLength(4)
  })

  it("announces background updates without replacing content", () => {
    render(<RefreshStatus refreshing error={null} />)

    expect(screen.getByRole("status")).toHaveTextContent("Updating")
  })

  it("shows a non-blocking refresh warning", () => {
    render(<RefreshStatus refreshing={false} error="database busy" />)

    expect(screen.getByRole("status")).toHaveTextContent(
      "Could not refresh: database busy"
    )
  })
})
