let loadPromise: Promise<unknown> | null = null

/** Comic Neue is only needed for the `comicSans` chat text effect. */
export function ensureComicNeue(): Promise<unknown> {
  if (!loadPromise) {
    loadPromise = import("@fontsource/comic-neue/400.css")
  }
  return loadPromise
}

export function textEffectsNeedComicNeue(
  effects: ReadonlyArray<{ type: string; value?: string }> | undefined,
): boolean {
  return effects?.some((e) => e.type === "font" && e.value === "comicSans") ?? false
}
