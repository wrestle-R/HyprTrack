import { useEffect, useId, useRef, useState, type CSSProperties } from "react"
import { COLOR_THEMES, type ColorTheme } from "../lib/themes"

export function ThemeOptions({ value, onChange }: {
  value: ColorTheme
  onChange: (theme: ColorTheme) => void
}) {
  return (
    <div className="theme-options">
      {COLOR_THEMES.map((theme) => (
        <button key={theme.id} type="button"
          className={`theme-option theme-preview-${theme.id}`}
          aria-pressed={value === theme.id}
          onClick={() => onChange(theme.id)}>
          <span className="theme-preview" aria-hidden="true"><i /><i /><i /></span>
          <span className="theme-option-name">{theme.name}<span aria-hidden="true">{value === theme.id ? "✓" : ""}</span></span>
          <small>{theme.description}</small>
        </button>
      ))}
    </div>
  )
}

export function ThemePicker({ value, onChange }: {
  value: ColorTheme
  onChange: (theme: ColorTheme) => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const theme = COLOR_THEMES.find((item) => item.id === value)!
  const close = () => { setOpen(false); trigger.current?.focus() }

  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [open])

  return (
    <div className="theme-picker" ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) { event.stopPropagation(); close() }
      }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
      <button ref={trigger} className="button secondary theme-picker-trigger" type="button"
        aria-label={`Color theme: ${theme.name}`} aria-haspopup="dialog" aria-expanded={open}
        aria-controls={open ? id : undefined} onClick={() => setOpen((current) => !current)}>
        <i className="palette-dot" style={{ "--swatch": theme.swatch } as CSSProperties} aria-hidden="true" />
        <span>{theme.name}</span>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <section id={id} className="theme-popover" role="dialog" aria-label="Choose a theme">
          <div className="popover-heading"><strong>Make it yours.</strong><span>Six palettes. Light or dark.</span></div>
          <ThemeOptions value={value} onChange={(next) => { onChange(next); close() }} />
        </section>
      )}
    </div>
  )
}
