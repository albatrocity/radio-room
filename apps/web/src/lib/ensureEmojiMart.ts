let initPromise: Promise<unknown> | null = null

/**
 * Load emoji-mart data off the critical path. Chat `<em-emoji>` custom elements
 * need `init` before they render glyphs; kick this off on room mount (idle) and
 * from the reaction picker.
 */
export function ensureEmojiMart(): Promise<unknown> {
  if (!initPromise) {
    initPromise = Promise.all([import("@emoji-mart/data"), import("emoji-mart")]).then(
      ([dataMod, mart]) => {
        mart.init({ data: dataMod.default })
        return dataMod.default
      },
    )
  }
  return initPromise
}
