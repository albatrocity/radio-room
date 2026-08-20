/**
 * Trailing debounce for socket-driven refetches: a burst of broadcast events
 * collapses into one request. `cancel` exists so a pending call cannot fire
 * after an actor deactivates.
 */
export function createTrailingDebounce(
  fn: () => void,
  waitMs: number,
): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    schedule() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        fn()
      }, waitMs)
    },
    cancel() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}
