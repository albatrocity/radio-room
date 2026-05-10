import { useEffect, type RefObject } from "react"
import { createScope } from "animejs"

/**
 * Registers an Anime.js scope for `rootRef` while `enabled` is true and the node exists.
 * Reverts on cleanup so inline animated values are cleared.
 */
export function useAnimeScope(rootRef: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const root = rootRef.current
    if (!root) return
    const scope = createScope({ root })
    return () => {
      scope.revert()
    }
  }, [enabled, rootRef])
}
