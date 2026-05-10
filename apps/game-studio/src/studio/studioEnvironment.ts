import type { StudioBootstrap } from "./studioBootstrap"
import { bootstrapStudio } from "./studioBootstrap"
import { tickExpiredModifiers } from "./modifierTick"

let bootstrapPromise: Promise<StudioBootstrap> | null = null
let studioRef: StudioBootstrap | null = null
let ticker: ReturnType<typeof setInterval> | null = null

export function ensureStudioLoaded(): Promise<StudioBootstrap> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapStudio().then((b) => {
      studioRef = b
      return b
    })
  }
  return bootstrapPromise
}

export function getStudio(): StudioBootstrap {
  if (!studioRef) {
    throw new Error("Game Studio has not finished loading yet")
  }
  return studioRef
}

export function startModifierTicker(): void {
  if (ticker) return
  ticker = setInterval(() => {
    try {
      const studio = getStudio()
      tickExpiredModifiers(studio.room, studio.lifecycle)
    } catch {
      /* studio not bootstrapped yet */
    }
  }, 1000)
}

export function stopModifierTicker(): void {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}
