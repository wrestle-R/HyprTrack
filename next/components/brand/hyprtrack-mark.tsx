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
      <path
        d="M14 8v48M50 8v48"
        fill="none"
        stroke="var(--foreground)"
        strokeLinecap="round"
        strokeWidth="6"
      />
      <path
        d="M7 34h17l6-14 8 27 6-13h13"
        fill="none"
        stroke="var(--primary)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5.5"
      />
    </svg>
  )
}
