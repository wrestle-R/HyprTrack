import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ActivityTooltip } from "./analytics-pages"

describe("activity rhythm tooltip", () => {
  it("shows duration and difference from the selected-range average", () => {
    render(
      <ActivityTooltip
        active
        average={30}
        payload={[
          {
            payload: {
              bucket: "2026-06-14T10",
              label: "10:00",
              minutes: 45,
            },
            value: 45,
          },
        ]}
      />
    )

    expect(screen.getByText("10:00")).toBeInTheDocument()
    expect(screen.getByText("45m")).toBeInTheDocument()
    expect(screen.getByText("15m above average")).toBeInTheDocument()
  })
})
