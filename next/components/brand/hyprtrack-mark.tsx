import type { SVGProps } from "react"

type HyprTrackMarkProps = SVGProps<SVGSVGElement> & {
  title?: string
}

export function HyprTrackMark({ title, ...props }: HyprTrackMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect width="64" height="64" rx="17" fill="var(--foreground)" />
      <path
        d="M18 17v30M46 17v30"
        fill="none"
        stroke="var(--background)"
        strokeLinecap="round"
        strokeWidth="7"
      />
      <path
        d="M17 34h9l4-10 7 20 4-10h7"
        fill="none"
        stroke="var(--primary)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
    </svg>
  )
}
