/**
 * Extra virtual rows for touch fling (iOS momentum especially). Fine pointer
 * (mouse/trackpad) does not need the doubled overscan.
 */
export function prefersCoarsePointer(
  matchMedia: ((query: string) => { matches: boolean }) | undefined = typeof window !== "undefined"
    ? window.matchMedia.bind(window)
    : undefined,
): boolean {
  if (!matchMedia) return false
  return matchMedia("(pointer: coarse)").matches
}

export function virtualizerOverscan(
  desktop: number,
  touch: number,
  coarse = prefersCoarsePointer(),
): number {
  return coarse ? touch : desktop
}
