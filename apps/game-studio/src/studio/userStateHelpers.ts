import type { GameSessionConfig, GameAttributeName, UserGameState } from "@repo/types"
import { pruneExpiredModifiers } from "@repo/game-logic"

export function initialUserStateForConfig(config: GameSessionConfig, userId: string): UserGameState {
  const attributes: Record<GameAttributeName, number> = {} as Record<GameAttributeName, number>
  for (const attr of config.enabledAttributes) {
    attributes[attr] = config.initialValues[attr] ?? 0
  }
  return { userId, attributes, modifiers: [], flags: {} }
}

export function pruneUserModifiers(state: UserGameState, now: number): UserGameState {
  const { active } = pruneExpiredModifiers(state.modifiers ?? [], now)
  return { ...state, modifiers: active }
}
