const APP_HEIGHT_VAR = "--app-height"

export function isStandaloneDisplay(
  matchesStandalone: boolean,
  iosNavigatorStandalone: boolean,
): boolean {
  return matchesStandalone || iosNavigatorStandalone
}

/**
 * Safari tabs: visualViewport height (URL bar and keyboard shrink the visual
 * viewport in place). Installed: 100lvh — innerHeight stays at the Safari-chrome
 * size even with no chrome. Do not translate by visualViewport.offsetTop; that
 * follows Safari's keyboard pan and yanks Now Playing off-screen.
 */
export function appHeightCssValue(
  visualHeight: number | undefined,
  innerHeight: number,
  standalone: boolean,
): string {
  if (standalone) return "100lvh"
  return `${visualHeight ?? innerHeight}px`
}

/** Skip `setProperty` when the computed height string has not changed. */
export function appHeightNeedsWrite(previous: string | null, next: string): boolean {
  return previous !== next
}

function readStandalone(): boolean {
  return isStandaloneDisplay(
    window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches,
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  )
}

function resetWindowScroll() {
  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

let lastWritten: string | null = null

export function syncAppHeight() {
  const standalone = readStandalone()
  const vv = window.visualViewport
  const next = appHeightCssValue(vv?.height, window.innerHeight, standalone)
  if (appHeightNeedsWrite(lastWritten, next)) {
    lastWritten = next
    document.documentElement.style.setProperty(APP_HEIGHT_VAR, next)
  }
  if (!standalone) resetWindowScroll()
}

export function startAppHeightSync(): () => void {
  let frame = 0
  const onChange = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      syncAppHeight()
    })
  }

  lastWritten = null
  syncAppHeight()
  window.visualViewport?.addEventListener("resize", onChange)
  window.visualViewport?.addEventListener("scroll", onChange)
  window.addEventListener("resize", onChange)
  window.addEventListener("orientationchange", onChange)
  document.addEventListener("focusin", onChange, true)
  document.addEventListener("focusout", onChange, true)
  return () => {
    if (frame) cancelAnimationFrame(frame)
    window.visualViewport?.removeEventListener("resize", onChange)
    window.visualViewport?.removeEventListener("scroll", onChange)
    window.removeEventListener("resize", onChange)
    window.removeEventListener("orientationchange", onChange)
    document.removeEventListener("focusin", onChange, true)
    document.removeEventListener("focusout", onChange, true)
  }
}
