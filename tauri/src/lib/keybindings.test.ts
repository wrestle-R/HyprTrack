import { describe, expect, it } from "vitest"

import {
  DEFAULT_KEYBINDINGS,
  shortcutFromKeyboardEvent,
  validateKeybindings,
  type Keybinding,
} from "./keybindings"

describe("keybindings", () => {
  it("normalizes a supported app-local shortcut", () => {
    expect(
      shortcutFromKeyboardEvent({
        key: "K",
        ctrlKey: true,
        altKey: true,
        shiftKey: false,
        metaKey: false,
      })
    ).toBe("Ctrl+Alt+K")
  })

  it("rejects Super and shortcuts without Ctrl or Alt", () => {
    expect(
      shortcutFromKeyboardEvent({
        key: "k",
        ctrlKey: false,
        altKey: false,
        shiftKey: true,
        metaKey: false,
      })
    ).toBeNull()
    expect(
      shortcutFromKeyboardEvent({
        key: "k",
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        metaKey: true,
      })
    ).toBeNull()
  })

  it("rejects duplicate assigned shortcuts", () => {
    const bindings: Keybinding[] = DEFAULT_KEYBINDINGS.map((binding) => ({
      ...binding,
    }))
    bindings[1].shortcut = bindings[0].shortcut

    expect(validateKeybindings(bindings)).toEqual({
      [bindings[1].action]: "Shortcut is already assigned.",
    })
  })
})
