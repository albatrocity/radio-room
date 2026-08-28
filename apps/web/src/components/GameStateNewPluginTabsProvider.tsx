import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import { useMachine } from "@xstate/react"
import type { PluginTabEntry } from "./Modals/GameState"
import { useCurrentRoom, useCurrentUser } from "../hooks/useActors"
import { useGameStatePluginTabEntries } from "../hooks/useGameStatePluginTabEntries"
import { gameStateNewPluginTabsMachine } from "../machines/gameStateNewPluginTabsMachine"
import { subscribeById, unsubscribeById } from "../actors/socketActor"
import { bindGameStatePluginTabsSend } from "../lib/gameStatePluginTabViewed"

export interface GameStateNewPluginTabsContextValue {
  pluginTabs: PluginTabEntry[]
  unseenPluginTabIds: ReadonlySet<string>
  hasUnseenPluginTabs: boolean
  markPluginTabViewed: (tabId: string) => void
  markPluginTabAttention: (tabId: string) => void
}

const GameStateNewPluginTabsContext = createContext<GameStateNewPluginTabsContextValue | null>(
  null,
)

export function GameStateNewPluginTabsProvider({ children }: { children: ReactNode }) {
  const room = useCurrentRoom()
  const roomId = room?.id ?? null
  const currentUser = useCurrentUser()
  const currentUserId = currentUser?.userId
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
    bindGameStatePluginTabsSend(send)
    return () => bindGameStatePluginTabsSend(null)
  }, [send])

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

  const markPluginTabAttention = useCallback(
    (tabId: string) => {
      send({ type: "TAB_ATTENTION", tabId })
    },
    [send],
  )

  // Generic plugin tab attention (ADR 0097) — plugins call
  // `requestGameStateTabAttention`; no per-plugin event wiring here.
  const userIdRef = useRef(currentUserId)
  userIdRef.current = currentUserId
  useEffect(() => {
    const subId = `plugin-tab-attention-${roomId ?? "none"}`
    subscribeById(subId, {
      send: (ev: {
        type: string
        data?: { userId?: string; tabId?: string; pluginName?: string }
      }) => {
        if (ev.type !== "PLUGIN_TAB_ATTENTION") return
        const rawTabId = ev.data?.tabId
        if (!rawTabId) return
        if (ev.data?.userId && ev.data.userId !== userIdRef.current) return
        // Tabs are keyed `${pluginName}:${schemaTabId}`; accept either form.
        const namespaced =
          ev.data?.pluginName && !rawTabId.includes(":")
            ? `${ev.data.pluginName}:${rawTabId}`
            : rawTabId
        const tabId = currentTabIdSet.has(namespaced)
          ? namespaced
          : currentTabIdSet.has(rawTabId)
            ? rawTabId
            : null
        if (!tabId) return
        send({ type: "TAB_ATTENTION", tabId })
      },
    })
    return () => unsubscribeById(subId)
  }, [roomId, send, currentTabIdSet])

  const value = useMemo((): GameStateNewPluginTabsContextValue => {
    // Drop ids for tabs no longer in the UI so the button clears even if the machine event is one frame late.
    const pending = state.context.pendingIds.filter((id) => currentTabIdSet.has(id))
    return {
      pluginTabs,
      unseenPluginTabIds: new Set(pending),
      hasUnseenPluginTabs: pending.length > 0,
      markPluginTabViewed,
      markPluginTabAttention,
    }
  }, [
    pluginTabs,
    state.context.pendingIds,
    markPluginTabViewed,
    markPluginTabAttention,
    currentTabIdSet,
  ])

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
