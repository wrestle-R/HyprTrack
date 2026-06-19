import * as React from "react"
import {
  Cancel01Icon,
  KeyboardIcon,
  RestoreBinIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  cloneDefaultKeybindings,
  shortcutFromKeyboardEvent,
  validateKeybindings,
  type Keybinding,
  type ShortcutActionId,
  type ShortcutGroup,
} from "../lib/keybindings"

type KeybindingsPageProps = {
  bindings: Keybinding[]
  onSave: (bindings: Keybinding[]) => void
}

const GROUPS: ShortcutGroup[] = ["Navigation", "Dashboard", "Display"]

export function KeybindingsPage({
  bindings,
  onSave,
}: KeybindingsPageProps) {
  const [draftBindings, setDraftBindings] = React.useState(() =>
    bindings.map((binding) => ({ ...binding }))
  )
  const [capturing, setCapturing] = React.useState<ShortcutActionId | null>(null)
  const [captureError, setCaptureError] = React.useState("")
  const [saved, setSaved] = React.useState(false)
  const errors = validateKeybindings(draftBindings)
  const hasErrors = Object.keys(errors).length > 0

  React.useEffect(() => {
    setDraftBindings(bindings.map((binding) => ({ ...binding })))
  }, [bindings])

  React.useEffect(() => {
    if (!capturing) {
      return
    }

    const capture = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const shortcut = shortcutFromKeyboardEvent(event)
      if (!shortcut) {
        setCaptureError(
          "Use Ctrl or Alt with a letter, number, arrow, Tab, Enter, or Escape. Super is not allowed."
        )
        return
      }
      setDraftBindings((current) =>
        current.map((binding) =>
          binding.action === capturing ? { ...binding, shortcut } : binding
        )
      )
      setCaptureError("")
      setCapturing(null)
      setSaved(false)
    }

    window.addEventListener("keydown", capture, true)
    return () => window.removeEventListener("keydown", capture, true)
  }, [capturing])

  return (
    <div className="page-stack">
      <section className="panel editor-intro">
        <div>
          <p className="section-kicker">App-local controls</p>
          <h2>Move through HyprTrack without leaving the keyboard</h2>
          <p>
            Shortcuts work only while this window is focused. HyprTrack never
            registers global shortcuts and never allows the Super key.
          </p>
        </div>
        <button
          className="button secondary header-button"
          type="button"
          onClick={() => {
            setDraftBindings(cloneDefaultKeybindings())
            setCapturing(null)
            setCaptureError("")
            setSaved(false)
          }}
        >
          <HugeiconsIcon icon={RestoreBinIcon} strokeWidth={1.8} />
          Restore defaults
        </button>
      </section>

      {captureError ? (
        <div className="validation-banner" role="alert">
          {captureError}
        </div>
      ) : null}

      {GROUPS.map((group) => (
        <section className="panel shortcut-group" key={group}>
          <div className="panel-header">
            <div>
              <h2>{group}</h2>
              <p>
                {group === "Navigation"
                  ? "Open any HyprTrack section directly."
                  : group === "Dashboard"
                    ? "Control ranges, refresh, and page search."
                    : "Change how the application looks."}
              </p>
            </div>
          </div>
          <div className="shortcut-list">
            {draftBindings
              .filter((binding) => binding.group === group)
              .map((binding) => (
                <div className="shortcut-row" key={binding.action}>
                  <div className="shortcut-copy">
                    <HugeiconsIcon icon={KeyboardIcon} strokeWidth={1.8} />
                    <div>
                      <strong>{binding.label}</strong>
                      {errors[binding.action] ? (
                        <span className="field-error">
                          {errors[binding.action]}
                        </span>
                      ) : (
                        <span>Available while HyprTrack is focused</span>
                      )}
                    </div>
                  </div>
                  <div className="shortcut-actions">
                    <button
                      className={`shortcut-recorder ${
                        capturing === binding.action ? "recording" : ""
                      } ${errors[binding.action] ? "invalid" : ""}`}
                      type="button"
                      data-shortcut-capture="true"
                      onClick={() => {
                        setCaptureError("")
                        setCapturing(binding.action)
                      }}
                    >
                      {capturing === binding.action
                        ? "Press shortcut…"
                        : binding.shortcut || "Unassigned"}
                    </button>
                    <button
                      className="button icon-button"
                      type="button"
                      aria-label={`Clear ${binding.label}`}
                      onClick={() => {
                        setDraftBindings((current) =>
                          current.map((candidate) =>
                            candidate.action === binding.action
                              ? { ...candidate, shortcut: "" }
                              : candidate
                          )
                        )
                        setSaved(false)
                      }}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ))}

      <div className="editor-footer panel">
        <p aria-live="polite">
          {hasErrors
            ? "Resolve duplicate shortcuts before saving."
            : saved
              ? "Keybindings saved."
              : "Click a shortcut, then press your new combination."}
        </p>
        <button
          className="button primary"
          type="button"
          disabled={hasErrors || capturing !== null}
          onClick={() => {
            onSave(draftBindings)
            setSaved(true)
          }}
        >
          Save keybindings
        </button>
      </div>
    </div>
  )
}
