import type { GameStateModifier } from "@repo/types"

/** Timed modifier flag: stackable delay before chat messages are delivered (1s per stack). */
export const CHAT_BUFFER_FLAG = "chat_buffer"

/** Milliseconds added to send latency per active buffer modifier stack. */
export const CHAT_BUFFER_MS_PER_STACK = 1000

function countModifierStacksForFlag(
  modifiers: GameStateModifier[] | undefined,
  now: number,
  flagName: string,
): number {
  let stacks = 0
  for (const modifier of modifiers ?? []) {
    if (modifier.startAt > now || modifier.endAt <= now) continue
    const has = modifier.effects.some(
      (effect) => effect.type === "flag" && effect.name === flagName && effect.value === true,
    )
    if (has) stacks += 1
  }
  return stacks
}

/**
 * Count active modifiers that apply the chat buffer flag (one stack per modifier).
 */
export function countChatBufferStacks(
  modifiers: GameStateModifier[] | undefined,
  now: number,
): number {
  return countModifierStacksForFlag(modifiers, now, CHAT_BUFFER_FLAG)
}

/** Total send delay for the current modifier stacks (0 when none active). */
export function getChatSendDelayMs(
  modifiers: GameStateModifier[] | undefined,
  now: number = Date.now(),
): number {
  return countChatBufferStacks(modifiers, now) * CHAT_BUFFER_MS_PER_STACK
}
