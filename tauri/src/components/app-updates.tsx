import { useState } from "react"
import type { AppUpdateState } from "../hooks/use-app-update"
import releases from "../lib/releases.json"
import "./app-updates.css"

function progressLabel(update: AppUpdateState) {
  const progress = update.progress
  if (progress?.phase === "downloading") {
    const percent = progress.total ? Math.min(100, Math.round(progress.downloaded / progress.total * 100)) : null
    return percent === null ? "Downloading…" : `Downloading ${percent}%`
  }
  return progress?.phase === "installing" ? "Verifying & installing…" : progress?.phase === "restarting" ? "Restarting…" : "Checking…"
}

export function UpdateControl({ update, compact = false }: { update: AppUpdateState; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  if (compact && !update.availableVersion && !update.busy) return null
  const percent = update.progress?.total ? Math.min(100, Math.round(update.progress.downloaded / update.progress.total * 100)) : null
  const install = () => { setOpen(true); void update.install() }
  return <div className={compact ? "app-update-control" : "app-update-settings"}>
    {compact ? <button className="button primary header-button" type="button" disabled={update.busy} aria-busy={update.busy} onClick={install}>{update.busy ? progressLabel(update) : `Update to v${update.availableVersion}`}</button> : <>
      <div className="app-version-line"><strong>HyprTrack Desktop</strong><span className="pill">v{update.info.version}</span></div>
      <p>{update.availableVersion ? `Version ${update.availableVersion} is ready.` : update.checking ? "Checking for updates…" : update.checked && update.info.updateSupported ? "You have the latest published version." : "Updates are checked when the app opens."}</p>
      {!update.info.updateSupported ? <p>In-app installation is available in the Linux AppImage. Update DEB/RPM packages through your package manager.</p> : null}
      <div className="app-update-actions"><button className="button secondary" type="button" disabled={update.checking || update.busy} onClick={() => { setOpen(true); void update.check() }}>{update.checking ? "Checking…" : "Check for updates"}</button>
        {update.availableVersion ? <button className="button primary" type="button" disabled={update.busy || !update.info.updateSupported} onClick={install}>{update.busy ? progressLabel(update) : "Install & restart"}</button> : null}
      </div>
    </>}
    {(compact ? open : true) && (update.busy || update.error) ? <div className={compact ? "app-update-popover" : "app-update-status"} role={update.error ? "alert" : "status"} aria-live="polite">
      <strong>{update.error ? "Could not complete the update" : progressLabel(update)}</strong><p>{update.error ?? "Your usage database and preferences stay in place."}</p>
      {update.busy ? <div className={`app-update-track ${percent === null ? "indeterminate" : ""}`} role="progressbar" aria-label="App update progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}><span style={{ width: `${percent ?? 35}%` }} /></div> : null}
      {compact && !update.busy ? <button className="button secondary" type="button" onClick={() => setOpen(false)}>Close</button> : null}
    </div> : null}
  </div>
}

export function WhatsNewPage({ version }: { version: string }) {
  return <div className="page-stack whats-new-page">
    <section className="hero-panel"><div><p className="eyebrow">The release notebook</p><h1>What’s new in HyprTrack</h1><p className="hero-copy">The useful additions, the small fixes, and what changed along the way.</p></div><span className="pill">Installed v{version}</span></section>
    {releases.map((release, index) => <article className="panel release-entry" key={release.version}>
      <div className="release-entry-meta"><span className="pill">v{release.version}</span><time dateTime={release.date}>{new Intl.DateTimeFormat("en-IN", {day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Kolkata"}).format(new Date(`${release.date}T00:00:00+05:30`))}</time>{index === 0 ? <span>Latest in this app</span> : null}</div>
      <h2>{release.title}</h2><ul>{release.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
    </article>)}
    <p className="release-notes-footnote">Release notes are included with the app and work offline.</p>
  </div>
}
