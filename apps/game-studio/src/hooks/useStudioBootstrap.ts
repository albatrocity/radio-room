import { useEffect, useState } from "react"
import type { StudioBootstrap } from "../studio/studioBootstrap"
import { ensureStudioLoaded } from "../studio/studioEnvironment"

export function useStudioBootstrap(): StudioBootstrap | null {
  const [boot, setBoot] = useState<StudioBootstrap | null>(null)
  useEffect(() => {
    let cancelled = false
    void ensureStudioLoaded().then((b) => {
      if (!cancelled) setBoot(b)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return boot
}
