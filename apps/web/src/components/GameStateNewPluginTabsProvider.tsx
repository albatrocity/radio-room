import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react"
import { useMachine } from "@xstate/react"
import type { PluginTabEntry } from "./Modals/GameState"
import { useCurrentRoom } from "../hooks/useActors"
import { useGameStatePluginTabEntries } from "../hooks/useGameStatePluginTabEntries"
import { gameStateNewPluginTabsMachine } from "../machines/gameStateNewPluginTabsMachine"

export interface GameStateNewPluginTabsContextValue {
  pluginTabs: PluginTabEntry[]
  unseenPluginTabIds: ReadonlySet<string>
  hasUnseenPluginTabs: boolean
  markPluginTabViewed: (tabId: string) => void
}

const GameStateNewPluginTabsContext = createContext<GameStateNewPluginTabsContextValue | null>(
  null,
)

export function GameStateNewPluginTabsProvider({ children }: { children: ReactNode }) {
  const room = useCurrentRoom()
  const roomId = room?.id ?? null
  const pluginTabs = useGameStatePluginTabEntries()

  /** Stable dependency so empty ↔ non-empty tab lists always re-sync the machine (see baseline empty handler). */
  const pluginTabIdsKey = useMemo(
    () =>
      pluginTabs
        .map((t) => t.id)
        .sort((a, b) => a.localeCompare(b))
        .join("\0"),
    [pluginTabs],
  )

  const currentTabIdSet = useMemo(
    () => new Set(pluginTabs.map((t) => t.id)),
    [pluginTabs],
  )

  const [state, send] = useMachine(gameStateNewPluginTabsMachine, {
    input: { roomId },
  })

  useEffect(() => {
    send({ type: "ROOM_CHANGED", roomId })
  }, [roomId, send])

  useEffect(() => {
    const ids = pluginTabs.map((t) => t.id).sort((a, b) => a.localeCompare(b))
    send({ type: "PLUGIN_TABS_CHANGED", ids })
  }, [pluginTabIdsKey, pluginTabs, send])

  const markPluginTabViewed = useCallback(
    (tabId: string) => {
      send({ type: "TAB_VIEWED", tabId })
    },
    [send],
  )

  const value = useMemo((): GameStateNewPluginTabsContextValue => {
    // Drop ids for tabs no longer in the UI so the button clears even if the machine event is one frame late.
    const pending = state.context.pendingIds.filter((id) => currentTabIdSet.has(id))
    return {
      pluginTabs,
      unseenPluginTabIds: new Set(pending),
      hasUnseenPluginTabs: pending.length > 0,
      markPluginTabViewed,
    }
  }, [pluginTabs, state.context.pendingIds, markPluginTabViewed, currentTabIdSet])

  return (
    <GameStateNewPluginTabsContext.Provider value={value}>
      {children}
    </GameStateNewPluginTabsContext.Provider>
  )
}

export function useGameStateNewPluginTabs(): GameStateNewPluginTabsContextValue {
  const ctx = useContext(GameStateNewPluginTabsContext)
  if (!ctx) {
    throw new Error("useGameStateNewPluginTabs must be used within GameStateNewPluginTabsProvider")
  }
  return ctx
}
