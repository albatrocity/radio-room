import { gameStateNavActor } from "../actors/gameStateNavActor"

export function isViewingGameStateTab(tabId: string): boolean {
  const snap = gameStateNavActor.getSnapshot()
  return snap.matches("active") && snap.context.activeTabId === tabId
}
