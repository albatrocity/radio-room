import type { GameStateNewPluginTabsEvent } from "../machines/gameStateNewPluginTabsMachine"

type Send = (event: GameStateNewPluginTabsEvent) => void

let send: Send | null = null

export function bindGameStatePluginTabsSend(next: Send | null): void {
  send = next
}

export function markGameStatePluginTabViewed(tabId: string): void {
  send?.({ type: "TAB_VIEWED", tabId })
}
