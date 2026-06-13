import {
  Activity01Icon,
  Analytics01Icon,
  Home01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"

export type NavigationItem = {
  title: string
  href: string
  icon: typeof Home01Icon
  description: string
}

export const NAVIGATION: NavigationItem[] = [
  {
    title: "Overview",
    href: "/",
    icon: Home01Icon,
    description: "Daily focus at a glance",
  },
  {
    title: "Activity",
    href: "/activity",
    icon: Activity01Icon,
    description: "Browse tracked sessions",
  },
  {
    title: "Applications",
    href: "/applications",
    icon: Analytics01Icon,
    description: "Compare application usage",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings01Icon,
    description: "Personalize the dashboard",
  },
]

export function isNavActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`)
}

export function getPageTitle(pathname: string) {
  return (
    NAVIGATION.find((item) => isNavActive(pathname, item.href))?.title ??
    "HyprTrack"
  )
}
