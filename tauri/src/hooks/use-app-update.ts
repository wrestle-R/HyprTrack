import { useCallback, useEffect, useRef, useState } from "react"
import { checkAppUpdate, getAppInfo, installAppUpdate, subscribeUpdateProgress, type AppInfo, type UpdateProgress } from "../lib/app-update"
import packageInfo from "../../package.json"

export function useAppUpdate() {
  const [info, setInfo] = useState<AppInfo>({ version: packageInfo.version, updateSupported: false })
  const [infoLoaded, setInfoLoaded] = useState(false)
  const [availableVersion, setAvailableVersion] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const mounted = useRef(false)
  const generation = useRef(0)
  const pending = useRef<Promise<void> | null>(null)
  const installing = useRef(false)
  const subscription = useRef<Promise<() => void> | null>(null)

  const check = useCallback((): Promise<void> => {
    if (installing.current) return Promise.resolve()
    if (pending.current) return pending.current
    const epoch = generation.current
    setChecking(true)
    const request = Promise.resolve().then(async () => {
      try {
        const app = await getAppInfo()
        if (!mounted.current || generation.current !== epoch || !app) return
        setInfo(app)
        setInfoLoaded(true)
        if (app.updateSupported) {
          const version = await checkAppUpdate()
          if (!mounted.current || generation.current !== epoch) return
          setAvailableVersion(version)
        }
        setChecked(true)
        setError(null)
      } catch (error) {
        if (mounted.current && generation.current === epoch) setError(String(error))
        // Keep an already discovered update if a later background check fails.
      } finally {
        if (mounted.current && generation.current === epoch) setChecking(false)
        if (pending.current === request) pending.current = null
      }
    })
    pending.current = request
    return request
  }, [])

  const install = useCallback(async () => {
    if (installing.current) return
    installing.current = true
    setBusy(true)
    setError(null)
    setProgress({ phase: "checking", downloaded: 0, total: null, version: null })
    // Prevent an older availability response overwriting installation state.
    generation.current++
    pending.current = null
    setChecking(false)
    let restarting = false
    try {
      await subscription.current
      const result = await installAppUpdate()
      if (!mounted.current) return
      if (result === "current") { setAvailableVersion(null); setProgress(null); setChecked(true) }
      if (result === "restarting") {
        restarting = true
        setProgress((current) => ({ phase: "restarting", downloaded: 0, total: null, version: current?.version ?? null }))
      }
    } catch (error) {
      if (mounted.current) { setError(String(error)); setProgress(null) }
    } finally {
      if (!restarting) {
        installing.current = false
        if (mounted.current) setBusy(false)
      }
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    let unsubscribe: (() => void) | undefined
    const promise = subscribeUpdateProgress((event) => {
      if (mounted.current && installing.current) setProgress(event)
    })
    subscription.current = promise
    void promise.then((dispose) => { if (mounted.current && subscription.current === promise) unsubscribe = dispose; else dispose() }).catch(() => undefined)
    const checkVisible = () => { if (document.visibilityState !== "hidden") void check() }
    void check()
    const timer = window.setInterval(checkVisible, 10 * 60_000)
    window.addEventListener("focus", checkVisible)
    window.addEventListener("online", checkVisible)
    document.addEventListener("visibilitychange", checkVisible)
    return () => {
      mounted.current = false
      generation.current++
      pending.current = null
      window.clearInterval(timer)
      window.removeEventListener("focus", checkVisible)
      window.removeEventListener("online", checkVisible)
      document.removeEventListener("visibilitychange", checkVisible)
      unsubscribe?.()
    }
  }, [check])

  return { info, infoLoaded, availableVersion, checking, busy, checked, error, progress, check, install }
}

export type AppUpdateState = ReturnType<typeof useAppUpdate>
