import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import type { GameStateDetailFrame } from "../../../types/GameStateDetail"

export type { GameStateDetailFrame }

type TabStack = GameStateDetailFrame[]

type GameStateNavContextValue = {
  activeTabId: string
  /** Detail frames for the active tab (empty = index). */
  stack: TabStack
  isDetail: boolean
  currentFrame: GameStateDetailFrame | null
  pushDetail: (frame: GameStateDetailFrame) => void
  popToIndex: () => void
  resetTab: (tabId: string) => void
  resetAll: () => void
  /** Replace the active tab's stack with a single detail frame (deep-link). */
  openDetailOnTab: (tabId: string, frame: GameStateDetailFrame) => void
}

const GameStateNavContext = createContext<GameStateNavContextValue | null>(null)

type ProviderProps = {
  activeTabId: string
  children: ReactNode
}

export function GameStateNavProvider({ activeTabId, children }: ProviderProps) {
  const [stacks, setStacks] = useState<Record<string, TabStack>>({})

  const stack = stacks[activeTabId] ?? []
  const currentFrame = stack.length > 0 ? (stack[stack.length - 1] ?? null) : null
  const isDetail = stack.length > 0

  const pushDetail = useCallback(
    (frame: GameStateDetailFrame) => {
      setStacks((prev) => ({
        ...prev,
        [activeTabId]: [...(prev[activeTabId] ?? []), frame],
      }))
    },
    [activeTabId],
  )

  const popToIndex = useCallback(() => {
    setStacks((prev) => ({
      ...prev,
      [activeTabId]: [],
    }))
  }, [activeTabId])

  const resetTab = useCallback((tabId: string) => {
    setStacks((prev) => ({
      ...prev,
      [tabId]: [],
    }))
  }, [])

  const resetAll = useCallback(() => {
    setStacks({})
  }, [])

  const openDetailOnTab = useCallback((tabId: string, frame: GameStateDetailFrame) => {
    setStacks((prev) => ({
      ...prev,
      [tabId]: [frame],
    }))
  }, [])

  const value = useMemo<GameStateNavContextValue>(
    () => ({
      activeTabId,
      stack,
      isDetail,
      currentFrame,
      pushDetail,
      popToIndex,
      resetTab,
      resetAll,
      openDetailOnTab,
    }),
    [
      activeTabId,
      stack,
      isDetail,
      currentFrame,
      pushDetail,
      popToIndex,
      resetTab,
      resetAll,
      openDetailOnTab,
    ],
  )

  return <GameStateNavContext.Provider value={value}>{children}</GameStateNavContext.Provider>
}

export function useGameStateNav(): GameStateNavContextValue {
  const ctx = useContext(GameStateNavContext)
  if (!ctx) {
    throw new Error("useGameStateNav must be used within GameStateNavProvider")
  }
  return ctx
}

/** Optional: shop/inventory templates may render outside provider in tests. */
export function useGameStateNavOptional(): GameStateNavContextValue | null {
  return useContext(GameStateNavContext)
}
