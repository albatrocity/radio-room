import { createContext, useContext, useMemo, type ReactNode } from "react"
import { hasInventoryPeek } from "@repo/game-logic"
import { useNow, useUserState } from "./useActors"

const InventoryPeekContext = createContext<boolean | undefined>(undefined)

/**
 * Ticks `useNow` once for the room tree. Context consumers only re-render when
 * the boolean flips (X-Ray on/off), not on every 1Hz tick (perf review P1).
 */
export function InventoryPeekProvider({ children }: { children: ReactNode }) {
  const state = useUserState()
  const now = useNow()
  const peek = useMemo(
    () => hasInventoryPeek(state?.modifiers, now),
    [state?.modifiers, now],
  )
  return (
    <InventoryPeekContext.Provider value={peek}>{children}</InventoryPeekContext.Provider>
  )
}

/** Whether the current user has an active X-Ray / `inventory_peek` flag (ADR 0149). */
export function useHasInventoryPeek(): boolean {
  const fromProvider = useContext(InventoryPeekContext)
  const state = useUserState()
  if (fromProvider !== undefined) return fromProvider
  return hasInventoryPeek(state?.modifiers, Date.now())
}
