import "./restoreSwell.css"

export const RESTORE_SWELL_DURATION_MS = 1300
export const RESTORE_SWELL_CLASS = "inventory-item-restore-swell"

/**
 * Play the restore swell + shimmer CSS animation on an element.
 * Resolves when the scale animation ends (or after a timeout fallback).
 */
export function playRestoreSwellEffect(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      element.classList.remove(RESTORE_SWELL_CLASS)
      element.removeEventListener("animationend", onEnd)
      resolve()
    }

    const onEnd = (event: AnimationEvent) => {
      if (event.target !== element) return
      // Prefer the scale keyframes; ignore the ::after shimmer's animationend.
      if (event.animationName && event.animationName !== "inventory-item-restore-swell-scale") {
        return
      }
      finish()
    }

    element.classList.add(RESTORE_SWELL_CLASS)
    element.addEventListener("animationend", onEnd)
    setTimeout(finish, RESTORE_SWELL_DURATION_MS + 100)
  })
}
