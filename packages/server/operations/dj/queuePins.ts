import { canonicalQueueTrackKey, type QueueItem } from "@repo/types/Queue"

/** Pinned blocks held by someone other than `actorPluginName` (ADR 0198). */
export function isForeignPin(item: QueueItem | null | undefined, actorPluginName?: string): boolean {
  return !!item?.pin && item.pin.pluginName !== actorPluginName
}

function heldMessage(item: QueueItem): string {
  return `This part of the queue is held by ${item.pin?.pluginName ?? "a plugin"}`
}

/**
 * Validate a full reorder of the waiting queue. Each foreign block must stay
 * contiguous, keep its internal order, and not move later. Returns a
 * user-facing message, or null when the reorder is allowed.
 */
export function findPinViolation(
  before: QueueItem[],
  after: QueueItem[],
  actorPluginName?: string,
): string | null {
  const blocks = new Map<string, { item: QueueItem; keys: string[]; start: number }>()
  before.forEach((item, index) => {
    if (!isForeignPin(item, actorPluginName)) return
    const blockId = item.pin!.blockId
    const block = blocks.get(blockId)
    if (block) block.keys.push(canonicalQueueTrackKey(item))
    else blocks.set(blockId, { item, keys: [canonicalQueueTrackKey(item)], start: index })
  })
  if (blocks.size === 0) return null

  const afterIndex = new Map(after.map((item, index) => [canonicalQueueTrackKey(item), index]))
  let violation: string | null = null
  blocks.forEach((block) => {
    if (violation) return
    const positions = block.keys.map((key) => afterIndex.get(key))
    const first = positions[0]
    if (
      first === undefined ||
      first > block.start ||
      !positions.every((p, i) => p === first + i)
    ) {
      violation = heldMessage(block.item)
    }
  })
  return violation
}

/** Removing a foreign pinned row is never allowed. */
export function findRemovalViolation(item: QueueItem, actorPluginName?: string): string | null {
  return isForeignPin(item, actorPluginName) ? heldMessage(item) : null
}

/**
 * Playing a row out of order: rejected when it sits after a foreign pinned row,
 * or when it is a foreign pinned row that is not at the head.
 */
export function findPlayOutOfOrderViolation(
  queue: QueueItem[],
  targetIndex: number,
  actorPluginName?: string,
): string | null {
  const target = queue[targetIndex]
  if (!target) return null
  if (isForeignPin(target, actorPluginName) && targetIndex !== 0) return heldMessage(target)
  const blocker = queue.slice(0, targetIndex).find((item) => isForeignPin(item, actorPluginName))
  return blocker ? heldMessage(blocker) : null
}

/** First index a new row may take without landing ahead of or inside a foreign block. */
export function minInsertIndex(queue: QueueItem[], actorPluginName?: string): number {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (isForeignPin(queue[i], actorPluginName)) return i + 1
  }
  return 0
}
