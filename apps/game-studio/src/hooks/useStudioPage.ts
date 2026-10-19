import { useSyncExternalStore } from "react"

export type StudioPage = "sandbox" | "trip-maps" | "trip-sim"

const PAGE_HASHES: Record<StudioPage, string> = {
  sandbox: "#/",
  "trip-maps": "#/trip-maps",
  "trip-sim": "#/trip-sim",
}

export function studioPageHref(page: StudioPage): string {
  return PAGE_HASHES[page]
}

function pageFromHash(hash: string): StudioPage {
  if (hash === PAGE_HASHES["trip-maps"]) return "trip-maps"
  if (hash === PAGE_HASHES["trip-sim"]) return "trip-sim"
  return "sandbox"
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}

/** Hash routing, so the static `dist` build needs no server rewrites. */
export function useStudioPage(): StudioPage {
  return useSyncExternalStore(subscribe, () => pageFromHash(window.location.hash))
}
