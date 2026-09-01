/**
 * Kill switch for the MSE radio transport. Defaults on when supported.
 *
 * Disable in dev: localStorage.setItem("radio-mse", "0")
 * Disable at build: VITE_RADIO_MSE=0
 * Force on at build: VITE_RADIO_MSE=1
 */

const STORAGE_KEY = "radio-mse"

export function radioMseEnabled(): boolean {
  if (import.meta.env.VITE_RADIO_MSE === "0") return false
  if (import.meta.env.VITE_RADIO_MSE === "1") return true
  if (typeof localStorage !== "undefined") {
    try {
      const value = localStorage.getItem(STORAGE_KEY)
      if (value === "0") return false
      if (value === "1") return true
    } catch {
      /* ignore */
    }
  }
  return true
}

/** Test helper */
export function __setRadioMseEnabledForTests(enabled: boolean): void {
  if (typeof localStorage === "undefined") return
  if (enabled) localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, "0")
}
