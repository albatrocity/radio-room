import { createContext, useContext, type ReactNode } from "react"

/** Match Chakra’s `md` breakpoint (`display={{ base, md: "none" }}` on the mobile header). */
export const SCHEDULER_MD_MIN_WIDTH_MEDIA = "(min-width: 48em)"

export type SchedulerLayoutContextValue = {
  /**
   * Live `offsetHeight` of the mobile-only sticky header (px).
   * `0` when the header is hidden at `md+` or before the first measurement.
   */
  mobileHeaderOuterHeightPx: number
}

const SchedulerLayoutContext = createContext<SchedulerLayoutContextValue | null>(null)

export function SchedulerLayoutProvider({
  value,
  children,
}: {
  value: SchedulerLayoutContextValue
  children: ReactNode
}) {
  return <SchedulerLayoutContext.Provider value={value}>{children}</SchedulerLayoutContext.Provider>
}

export function useSchedulerLayout(): SchedulerLayoutContextValue {
  const ctx = useContext(SchedulerLayoutContext)
  if (!ctx) {
    throw new Error("useSchedulerLayout must be used within SchedulerLayoutProvider (AppLayout)")
  }
  return ctx
}
