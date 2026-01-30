import type {
  Plugin,
  PluginContext,
  PluginConfigSchema,
  QueueValidationParams,
  QueueValidationResult,
  QueueItem,
} from "@repo/types"
import { allowQueueRequest, rejectQueueRequest } from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import {
  queueHygieneConfigSchema,
  defaultQueueHygieneConfig,
  type QueueHygieneConfig,
} from "./types"
import { getConfigSchema } from "./schema"

export type { QueueHygieneConfig } from "./types"
export { queueHygieneConfigSchema, defaultQueueHygieneConfig } from "./types"

// ============================================================================
// Constants
// ============================================================================

/** Redis key prefix for storing last queue timestamps */
const LAST_QUEUE_KEY_PREFIX = "lastQueue"

/** Scaling thresholds */
const DJ_COUNT_THRESHOLD = 10 // DJ count at which cooldown reaches max
const QUEUE_LENGTH_THRESHOLD = 15 // Queue length at which cooldown reaches max

// ============================================================================
// Plugin Implementation
// ============================================================================

/**
 * Queue Hygiene Plugin
 *
 * Enforces fair queue access by preventing users from adding consecutive tracks
 * when other DJs are waiting. Uses a two-tier system:
 *
 * 1. Primary: Check if adding would create consecutive tracks from same user
 *    - If last track in queue is from different user: allow immediately
 *    - If last track is from same user: apply cooldown check
 *
 * 2. Secondary: Dynamic cooldown based on room activity
 *    - Cooldown scales with DJ count and queue length
 *    - More DJs + longer queue = longer wait for consecutive additions
 *
 * ARCHITECTURE: Each instance handles exactly ONE room.
 * The PluginRegistry creates a new instance for each room.
 */
export class QueueHygienePlugin extends BasePlugin<QueueHygieneConfig> {
  name = "queue-hygiene"
  version = "1.0.0"
  description =
    "Prevent queue saturation by enforcing fair access rules for all DJs."

  static readonly configSchema = queueHygieneConfigSchema
  static readonly defaultConfig = defaultQueueHygieneConfig

  // ============================================================================
  // Schema Methods
  // ============================================================================

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    // Listen for successful queue additions to update timestamps
    this.on("QUEUE_CHANGED", this.onQueueChanged.bind(this))

    // React to config changes (enable/disable)
    this.onConfigChange(this.handleConfigChange.bind(this))

    console.log(`[${this.name}] Registered for room ${context.roomId}`)
  }

  // ============================================================================
  // Config Change Handling
  // ============================================================================

  private async handleConfigChange(data: {
    roomId: string
    pluginName: string
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }): Promise<void> {
    if (!this.context) return

    const config = data.config as QueueHygieneConfig
    const previousConfig = data.previousConfig as QueueHygieneConfig | null
    const wasEnabled = previousConfig?.enabled === true
    const isEnabled = config?.enabled === true

    console.log(`[${this.name}] Config changed:`, { wasEnabled, isEnabled })

    if (!wasEnabled && isEnabled) {
      await this.onPluginEnabled(config)
    } else if (wasEnabled && !isEnabled) {
      await this.onPluginDisabled()
    }
  }

  private async onPluginEnabled(config: QueueHygieneConfig): Promise<void> {
    console.log(`[${this.name}] Plugin enabled for room ${this.context!.roomId}`)

    await this.context!.api.sendSystemMessage(
      this.context!.roomId,
      `🧹 Queue Hygiene enabled: ${config.preventConsecutive ? "Consecutive tracks from the same DJ are limited" : "Rate limiting active"}`,
      { type: "alert", status: "info" },
    )
  }

  private async onPluginDisabled(): Promise<void> {
    console.log(`[${this.name}] Plugin disabled for room ${this.context!.roomId}`)

    await this.context!.api.sendSystemMessage(
      this.context!.roomId,
      `🧹 Queue Hygiene disabled`,
      { type: "alert", status: "info" },
    )
  }

  // ============================================================================
  // Queue Validation Hook
  // ============================================================================

  /**
   * Validate a queue request - implements fair access logic.
   *
   * Algorithm:
   * 1. If user is admin and exemptAdmins is enabled: allow
   * 2. If preventConsecutive is disabled: allow
   * 3. If this wouldn't create consecutive tracks: allow
   * 4. If this would create consecutive tracks:
   *    a. If rate limiting disabled: reject
   *    b. If rate limiting enabled: check if cooldown expired
   *       - Calculate dynamic cooldown based on DJ count & queue length
   *       - If expired: allow
   *       - If not expired: reject with remaining time
   */
  async validateQueueRequest(
    params: QueueValidationParams,
  ): Promise<QueueValidationResult> {
    if (!this.context) {
      return allowQueueRequest()
    }

    const config = await this.getConfig()
    if (!config?.enabled) {
      return allowQueueRequest()
    }

    const { userId } = params

    // Check if user is exempt (admin)
    if (config.exemptAdmins) {
      const users = await this.context.api.getUsers(this.context.roomId)
      const user = users.find((u) => u.userId === userId)
      if (user?.isAdmin) {
        return allowQueueRequest()
      }
    }

    // If consecutive prevention is disabled, allow
    if (!config.preventConsecutive) {
      return allowQueueRequest()
    }

    // Check if this would create consecutive tracks
    const wouldBeConsecutive = await this.wouldBeConsecutive(userId)

    if (!wouldBeConsecutive) {
      // Different user added the last track, allow immediately
      return allowQueueRequest()
    }

    // This would be consecutive - check rate limit
    if (!config.rateLimitEnabled) {
      // Rate limiting disabled, just reject consecutive
      return rejectQueueRequest(
        "Please wait for another DJ to add a song before adding another",
      )
    }

    // Check if cooldown has expired
    const lastQueueTimeStr = await this.context.storage.get(
      this.makeLastQueueKey(userId),
    )

    if (!lastQueueTimeStr) {
      // No record of last queue time, allow
      return allowQueueRequest()
    }

    const lastQueueTime = Number(lastQueueTimeStr)
    const now = Date.now()
    const elapsed = now - lastQueueTime

    // Calculate the applicable cooldown
    const cooldown = await this.calculateCooldown(config)

    if (elapsed >= cooldown) {
      // Cooldown expired, allow the consecutive addition
      return allowQueueRequest()
    }

    // Still in cooldown
    const remainingSeconds = Math.ceil((cooldown - elapsed) / 1000)
    return rejectQueueRequest(
      `You added the last song in the queue. Wait ${remainingSeconds}s or for another DJ to add a song.`,
    )
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * When queue changes, update the last queue timestamp for the user who added.
   */
  private async onQueueChanged(data: {
    roomId: string
    queue: QueueItem[]
  }): Promise<void> {
    if (!this.context) return

    const config = await this.getConfig()
    if (!config?.enabled) return

    // Find the most recently added item
    const sortedQueue = [...data.queue].sort(
      (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0),
    )

    const mostRecent = sortedQueue[0]
    if (!mostRecent?.addedBy?.userId || !mostRecent.addedAt) return

    // Check if this is a new addition (within last 5 seconds)
    const isRecent = Date.now() - mostRecent.addedAt < 5000

    if (isRecent) {
      // Update the user's last queue timestamp
      // TTL: keep for max cooldown duration + buffer
      const ttlSeconds = Math.ceil((config.maxCooldownMs + 60000) / 1000)
      await this.context.storage.set(
        this.makeLastQueueKey(mostRecent.addedBy.userId),
        String(mostRecent.addedAt),
        ttlSeconds,
      )
    }
  }

  // ============================================================================
  // Consecutive Check
  // ============================================================================

  /**
   * Check if the user adding would create consecutive tracks.
   * Returns true if the last track in the queue was added by the same user.
   */
  private async wouldBeConsecutive(userId: string): Promise<boolean> {
    const queue = await this.context!.api.getQueue(this.context!.roomId)

    if (queue.length === 0) {
      // Empty queue, can't be consecutive
      return false
    }

    // Get the last item in the queue (most recently added, at the end)
    // Queue is ordered by position, so last item is the one that would be
    // immediately before the new addition
    const lastItem = queue[queue.length - 1]

    if (!lastItem?.addedBy?.userId) {
      // No attribution on last item, allow
      return false
    }

    return lastItem.addedBy.userId === userId
  }

  // ============================================================================
  // Cooldown Calculation
  // ============================================================================

  /**
   * Calculate the current cooldown based on DJ count and queue length.
   *
   * The cooldown scales from baseCooldownMs to maxCooldownMs based on:
   * - Number of participating DJs (more DJs = longer wait)
   * - Current queue length (longer queue = longer wait)
   *
   * Formula: base + (max - base) * combinedRatio
   * Where combinedRatio is the average of DJ ratio and queue ratio (if enabled)
   */
  private async calculateCooldown(config: QueueHygieneConfig): Promise<number> {
    const { baseCooldownMs, maxCooldownMs } = config

    // If neither scaling factor is enabled, use base cooldown
    if (!config.cooldownScalesWithDjs && !config.cooldownScalesWithQueue) {
      return baseCooldownMs
    }

    const ratios: number[] = []

    // DJ count scaling
    if (config.cooldownScalesWithDjs) {
      const users = await this.context!.api.getUsers(this.context!.roomId, {
        status: "participating",
      })
      // Count DJs (deputy DJs + admins who can add songs)
      const djCount = users.filter((u) => u.isDeputyDj || u.isAdmin).length
      const djRatio = Math.min(djCount / DJ_COUNT_THRESHOLD, 1)
      ratios.push(djRatio)
    }

    // Queue length scaling
    if (config.cooldownScalesWithQueue) {
      const queue = await this.context!.api.getQueue(this.context!.roomId)
      const queueRatio = Math.min(queue.length / QUEUE_LENGTH_THRESHOLD, 1)
      ratios.push(queueRatio)
    }

    // Calculate combined ratio (average of enabled factors)
    const combinedRatio =
      ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0

    // Linear interpolation from base to max
    const cooldownRange = maxCooldownMs - baseCooldownMs
    const cooldown = baseCooldownMs + cooldownRange * combinedRatio

    console.log(
      `[${this.name}] Calculated cooldown: ${Math.round(cooldown)}ms (ratio: ${combinedRatio.toFixed(2)})`,
    )

    return Math.round(cooldown)
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private makeLastQueueKey(userId: string): string {
    return `${LAST_QUEUE_KEY_PREFIX}:${userId}`
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory function to create the plugin.
 * A new instance is created for each room.
 */
export function createQueueHygienePlugin(
  configOverrides?: Partial<QueueHygieneConfig>,
): Plugin {
  return new QueueHygienePlugin(configOverrides)
}

export default createQueueHygienePlugin
