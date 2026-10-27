import { useEffect, useRef, useState } from "react"
import type { AppUpdateState } from "../hooks/use-app-update"
import type { ReleaseNotice } from "../hooks/use-release-notice"
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

export function ReleaseNoticeDialog({ notice, onDismiss }: { notice: ReleaseNotice; onDismiss: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    closeButton.current?.focus()
    return () => element?.close()
  }, [])
  return <dialog ref={dialog} className="release-notice" aria-labelledby="release-notice-title" onCancel={(event) => { event.preventDefault(); onDismiss() }}>
    <div className="release-notice-header"><p className="eyebrow">Updated to v{notice.version}</p><h1 id="release-notice-title">What’s new in HyprTrack</h1>
      <p>{notice.previousVersion ? `Changes since v${notice.previousVersion}.` : "Here’s what changed in this release."} {notice.releases.length > 1 ? `${notice.releases.length} updates included.` : ""}</p></div>
    <div className="release-notice-content">{notice.releases.map(release => <article className="release-entry" key={release.version}>
      <div className="release-entry-meta"><span className="pill">v{release.version}</span><time dateTime={release.date}>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${release.date}T00:00:00+05:30`))}</time></div>
      <h2>{release.title}</h2><ul>{release.highlights.map(highlight => <li key={highlight}>{highlight}</li>)}</ul>
    </article>)}</div>
    <div className="release-notice-footer"><span>These notes won’t appear again for this version.</span><button ref={closeButton} className="button primary" type="button" onClick={onDismiss}>Continue to HyprTrack</button></div>
  </dialog>
}
