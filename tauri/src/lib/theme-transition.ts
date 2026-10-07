import { flushSync } from "react-dom"

let activeTransition: ViewTransition | undefined
let transitionGeneration = 0
let fallbackTimeout: number | undefined

export function changeAppearance(update: () => void) {
  const root = document.documentElement
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    activeTransition?.skipTransition()
    update()
    return
  }

  const source = document.activeElement instanceof HTMLElement
    ? document.activeElement.getBoundingClientRect()
    : null
  const x = source?.width ? source.left + source.width / 2 : window.innerWidth / 2
  const y = source?.height ? source.top + source.height / 2 : 60
  root.style.setProperty("--theme-x", `${x}px`)
  root.style.setProperty("--theme-y", `${y}px`)
  root.style.setProperty("--theme-radius", `${Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))}px`)

  if (typeof document.startViewTransition !== "function") {
    window.clearTimeout(fallbackTimeout)
    root.classList.add("theme-fading")
    update()
    fallbackTimeout = window.setTimeout(() => root.classList.remove("theme-fading"), 450)
    return
  }

  const generation = ++transitionGeneration
  activeTransition?.skipTransition()
  root.classList.add("theme-transition")
  const cleanup = () => {
    if (generation === transitionGeneration) {
      root.classList.remove("theme-transition")
      activeTransition = undefined
    }
  }
  try {
    activeTransition = document.startViewTransition(() => flushSync(update))
    void activeTransition.finished.then(cleanup, cleanup)
  } catch {
    cleanup()
    update()
  }
}
