export const COLOR_THEMES = [
  { id: "sage", name: "Sage", description: "Quiet greens", swatch: "#466b54" },
  { id: "ocean", name: "Ocean", description: "Cool blue tones", swatch: "#28667a" },
  { id: "sand", name: "Sand", description: "Warm earth tones", swatch: "#805c30" },
  { id: "rose", name: "Rose", description: "Soft pink tones", swatch: "#945368" },
  { id: "plum", name: "Plum", description: "Muted violets", swatch: "#775588" },
  { id: "orange", name: "Orange", description: "A familiar warmth", swatch: "#c57943" },
] as const

export type ColorTheme = (typeof COLOR_THEMES)[number]["id"]

export function isColorTheme(value: unknown): value is ColorTheme {
  return COLOR_THEMES.some((theme) => theme.id === value)
}
