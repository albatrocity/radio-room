import { useSyncExternalStore } from "react"

export type StudioPage = "sandbox" | "trip-maps"

const PAGE_HASHES: Record<StudioPage, string> = {
  sandbox: "#/",
  "trip-maps": "#/trip-maps",
}

export function studioPageHref(page: StudioPage): string {
  return PAGE_HASHES[page]
}

function pageFromHash(hash: string): StudioPage {
  return hash === PAGE_HASHES["trip-maps"] ? "trip-maps" : "sandbox"
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}

/** Hash routing, so the static `dist` build needs no server rewrites. */
export function useStudioPage(): StudioPage {
  return useSyncExternalStore(subscribe, () => pageFromHash(window.location.hash))
}
