export const VERSION = "2.1.0";
export const REPO = "https://github.com/wrestle-R/HyprTrack";
export const RELEASE = `${REPO}/releases/tag/v${VERSION}`;
export const DOWNLOAD = `${REPO}/releases/download/v${VERSION}/HyprTrack.Desktop_${VERSION}_amd64.AppImage`;
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://hyprtrack-delta.vercel.app");
export const INSTALL = `mkdir -p ~/.local/bin
wget -O ~/.local/bin/hyprtrack-desktop.AppImage \\
  ${DOWNLOAD}
chmod +x ~/.local/bin/hyprtrack-desktop.AppImage
~/.local/bin/hyprtrack-desktop.AppImage`;

export const DOCS = [
  { slug: "getting-started", title: "Getting started", description: "From download to your first recorded session." },
  { slug: "collector", title: "The collector", description: "A small listener. A continuous record." },
  { slug: "themes-and-focus", title: "Themes & focus", description: "Make the workspace yours, then settle into a session." },
  { slug: "mappings", title: "App mappings", description: "Give your activity names that make sense to you." },
  { slug: "shortcuts", title: "Keyboard shortcuts", description: "Move around without leaving the keyboard." },
  { slug: "updating", title: "Updating safely", description: "A newer app. The same activity history." },
  { slug: "privacy", title: "Your data", description: "Where it lives, what it contains, and how to inspect it." },
  { slug: "troubleshooting", title: "Troubleshooting", description: "A few useful checks when something feels off." },
] as const;

export const PALETTES = [
  { id: "sage", name: "Sage", light: ["#f3f5f1", "#25342b", "#466b54", "#dce4db"], dark: ["#141615", "#e4e8e5", "#abc7b3", "#373d39"] },
  { id: "ocean", name: "Ocean", light: ["#f0f5f7", "#203943", "#28667a", "#d5e3e9"], dark: ["#080a0c", "#e4eaee", "#78b5cd", "#2c3237"] },
  { id: "sand", name: "Sand", light: ["#f7f3eb", "#40362a", "#805c30", "#e2d8c8"], dark: ["#191817", "#e9e6e0", "#c8aa7d", "#403b33"] },
  { id: "rose", name: "Rose", light: ["#f8f1f2", "#462d35", "#945368", "#e9d5dd"], dark: ["#000000", "#ebe5e8", "#cd95a6", "#30292d"] },
  { id: "plum", name: "Plum", light: ["#f5f1f7", "#3e3049", "#775588", "#dfd4e6"], dark: ["#111013", "#e8e5ee", "#b29dce", "#38323e"] },
  { id: "orange", name: "Orange", light: ["oklch(1 0 0)", "oklch(0.2101 0.0318 264.6645)", "oklch(0.6716 0.1368 48.513)", "oklch(0.9276 0.0058 264.5313)"], dark: ["oklch(0.1797 0.0043 308.1928)", "oklch(0.8109 0 0)", "oklch(0.7214 0.1337 49.9802)", "oklch(0.252 0 0)"] },
] as const;
