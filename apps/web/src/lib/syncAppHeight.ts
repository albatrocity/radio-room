const APP_HEIGHT_VAR = "--app-height"
const KEYBOARD_INSET_VAR = "--keyboard-inset"

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
])

export function isStandaloneDisplay(
  matchesStandalone: boolean,
  iosNavigatorStandalone: boolean,
): boolean {
  return matchesStandalone || iosNavigatorStandalone
}

/** True when the focused node will open the software keyboard. */
export function isTextEditingTarget(target: unknown): boolean {
  if (target == null || typeof target !== "object") return false
  const el = target as {
    isContentEditable?: boolean
    tagName?: string
    type?: string
  }
  if (el.isContentEditable) return true
  if (el.tagName === "TEXTAREA") return true
  if (el.tagName !== "INPUT") return false
  return !NON_TEXT_INPUT_TYPES.has((el.type ?? "text").toLowerCase())
}

/**
 * Layout-viewport gap below the visual viewport. Used to lift overlay
 * footers above the software keyboard without translating the app shell
 * (see appHeightCssValue — offsetTop pan yanks Now Playing).
 */
export function keyboardInsetPx(
  editing: boolean,
  visualHeight: number | undefined,
  visualOffsetTop: number,
  innerHeight: number,
): number {
  if (!editing || visualHeight == null) return 0
  return Math.max(0, Math.round(innerHeight - visualHeight - visualOffsetTop))
}

export function keyboardInsetCssValue(px: number): string {
  return `${px}px`
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
let lastKeyboardWritten: string | null = null

export function syncAppHeight() {
  const standalone = readStandalone()
  const vv = window.visualViewport
  const next = appHeightCssValue(vv?.height, window.innerHeight, standalone)
  if (appHeightNeedsWrite(lastWritten, next)) {
    lastWritten = next
    document.documentElement.style.setProperty(APP_HEIGHT_VAR, next)
  }

  const keyboardNext = keyboardInsetCssValue(
    keyboardInsetPx(
      isTextEditingTarget(document.activeElement),
      vv?.height,
      vv?.offsetTop ?? 0,
      window.innerHeight,
    ),
  )
  if (appHeightNeedsWrite(lastKeyboardWritten, keyboardNext)) {
    lastKeyboardWritten = keyboardNext
    document.documentElement.style.setProperty(KEYBOARD_INSET_VAR, keyboardNext)
    if (keyboardNext === "0px") {
      delete document.documentElement.dataset.keyboardInset
    } else {
      document.documentElement.dataset.keyboardInset = "open"
    }
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
  lastKeyboardWritten = null
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
