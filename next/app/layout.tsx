import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SITE_URL } from "@/lib/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const body = localFont({ src: [{path:"../public/fonts/outfit-regular.woff2",weight:"400"},{path:"../public/fonts/outfit-medium.woff2",weight:"500"}], variable:"--font-body", display:"swap" });
const display = localFont({ src: [{path:"../public/fonts/bricolage-semibold.woff2",weight:"600"},{path:"../public/fonts/bricolage-bold.woff2",weight:"700"}], variable:"--font-display", display:"swap" });
const serif = localFont({ src:"../public/fonts/instrument-serif-italic.woff2",weight:"400",style:"italic",variable:"--font-serif",display:"swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default:"HyprTrack — Time leaves a trace.", template:"%s · HyprTrack" },
  description:"A quiet record of where your day goes. Local activity tracking, six themes, and a small focus timer. Built for Hyprland on Arch Linux. Free and open source.",
  applicationName:"HyprTrack",
  openGraph:{type:"website",siteName:"HyprTrack",locale:"en_US"},
  twitter:{card:"summary_large_image"},
};
export const viewport: Viewport = { width:"device-width",initialScale:1,themeColor:[{media:"(prefers-color-scheme: light)",color:"#f3f0e8"},{media:"(prefers-color-scheme: dark)",color:"#191916"}] };
const themeScript = `(function(){try{var t=localStorage.getItem('hyprtrack.site.appearance');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){}})()`;

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en" data-theme="light" suppressHydrationWarning className={`${body.variable} ${display.variable} ${serif.variable}`}><head><script dangerouslySetInnerHTML={{__html:themeScript}} /></head><body><a href="#main" className="skip-link">Skip to content</a><SiteHeader />{children}<SiteFooter /></body></html>;
}
