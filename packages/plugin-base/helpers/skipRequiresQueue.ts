import { z } from "zod"

/**
 * Shared Zod fragment for plugins that gate skips on remaining queue length.
 * Merge into a plugin config schema with `.merge(skipRequiresQueueConfigSchema)`.
 */
export const skipRequiresQueueConfigSchema = z.object({
  /** When true, only skip if the queue is longer than `skipRequiresQueueMin`. */
  skipRequiresQueue: z.boolean(),
  /** Minimum queue length required to skip (skip when `queueLength > min`). */
  skipRequiresQueueMin: z.number().min(0),
})

export type SkipRequiresQueueConfig = z.infer<typeof skipRequiresQueueConfigSchema>

export const defaultSkipRequiresQueueConfig: SkipRequiresQueueConfig = {
  skipRequiresQueue: false,
  skipRequiresQueueMin: 0,
}

/**
 * Returns true when a skip is allowed for the given queue length and config.
 * When `skipRequiresQueue` is false, always returns true.
 */
export function shouldSkipGivenQueue(
  queueLength: number,
  config: Pick<SkipRequiresQueueConfig, "skipRequiresQueue" | "skipRequiresQueueMin">,
): boolean {
  if (!config.skipRequiresQueue) return true
  return queueLength > config.skipRequiresQueueMin
}
