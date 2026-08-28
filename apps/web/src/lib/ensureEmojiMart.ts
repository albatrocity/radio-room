let initPromise: Promise<unknown> | null = null

type IdleHandle = { kind: "idle"; id: number } | { kind: "timeout"; id: ReturnType<typeof setTimeout> }

let scheduled: IdleHandle | null = null

type IdleCapableWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

function cancelScheduledLoad() {
  if (!scheduled) return
  if (scheduled.kind === "idle") {
    ;(window as IdleCapableWindow).cancelIdleCallback?.(scheduled.id)
  } else {
    clearTimeout(scheduled.id)
  }
  scheduled = null
}

/**
 * Load emoji-mart data off the critical path. Chat `<em-emoji>` custom elements
 * need `init` before they render glyphs; kick this off on idle (room mount) and
 * from the reaction picker / first chat paint.
 */
export function ensureEmojiMart(): Promise<unknown> {
  cancelScheduledLoad()
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

/** Defer the emoji-mart chunk until the browser is idle (or `timeoutMs`). */
export function scheduleEmojiMartIdleLoad(timeoutMs = 2000): void {
  if (initPromise || scheduled || typeof window === "undefined") return
  const w = window as IdleCapableWindow
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(() => {
      scheduled = null
      void ensureEmojiMart()
    }, { timeout: timeoutMs })
    scheduled = { kind: "idle", id }
    return
  }
  scheduled = {
    kind: "timeout",
    id: setTimeout(() => {
      scheduled = null
      void ensureEmojiMart()
    }, timeoutMs),
  }
}
