import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

export type AppInfo = { version: string; updateSupported: boolean }
export type UpdateProgress = {
  phase: "checking" | "downloading" | "installing" | "restarting" | "current"
  downloaded: number
  total: number | null
  version: string | null
}
export function getAppInfo() { return invoke<AppInfo>("get_app_info") }
export function checkAppUpdate() { return invoke<string | null>("check_app_update") }
export function installAppUpdate() { return invoke<string>("install_app_update") }
export function subscribeUpdateProgress(callback: (progress: UpdateProgress) => void) {
  return listen<UpdateProgress>("hyprtrack://update-progress", (event) => callback(event.payload))
}
