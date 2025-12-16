import type {
  Plugin,
  PluginContext,
  PluginConfigSchema,
  PluginComponentSchema,
  PluginComponentState,
  SystemEventPayload,
  ChatMessage,
  User,
} from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import { interpolateTemplate } from "@repo/utils"
import packageJson from "./package.json"
import {
  specialWordsConfigSchema,
  defaultSpecialWordsConfig,
  type SpecialWordsConfig,
} from "./types"
import { getComponentSchema, getConfigSchema } from "./schema"
import { PluginExportAugmentation, RoomExportData } from "@repo/types/RoomExport"

export type { SpecialWordsConfig } from "./types"
export { specialWordsConfigSchema, defaultSpecialWordsConfig } from "./types"

// ============================================================================
// Component State Type
// ============================================================================

interface LeaderboardEntry {
  score: number
  value: string
}

interface UserLeaderboardEntry extends LeaderboardEntry {
  /** Username for display (looked up from user data, falls back to userId if not found) */
  username: string
}

export interface SpecialWordsComponentState extends Record<string, unknown> {
  usersLeaderboard: UserLeaderboardEntry[]
  allWordsLeaderboard: LeaderboardEntry[]
}

// ============================================================================
// Constants
// ============================================================================

const USER_WORD_COUNT_KEY = "user-word-count"
const WORDS_PER_USER_KEY = "words-per-user"
const WORD_RANK_KEY = "word-rank"

// ============================================================================
// Event Types
// ============================================================================

/**
 * Plugin event payloads for special-words plugin.
 * Frontend can listen for: PLUGIN:special-words:SPECIAL_WORD_DETECTED
 */
export interface SpecialWordsEvents {
  SPECIAL_WORD_DETECTED: {
    word: string
    userId: string
    username?: string
    messageTimestamp: string
    userRank: number
    userAllWordsCount: number
    userThisWordCount: number
    totalWordsUsed: number
    thisWordCount: number
    thisWordRank: number
    usersLeaderboard: { score: number; value: string }[]
    allWordsLeaderboard: { score: number; value: string }[]
  }
}

// ============================================================================
// Plugin Implementation
// ============================================================================

/**
 * Special Words Plugin
 *
 * Detects special words in chat messages and emits events when they are found.
 * Tracks word usage statistics and maintains leaderboards.
 *
 * ARCHITECTURE: Each instance handles exactly ONE room.
 * The PluginRegistry creates a new instance for each room.
 */
export class SpecialWordsPlugin extends BasePlugin<SpecialWordsConfig> {
  name = "special-words"
  version = packageJson.version
  description = "Detect special words in chat messages and emit events when they are found."

  static readonly configSchema = specialWordsConfigSchema
  static readonly defaultConfig = defaultSpecialWordsConfig

  // ============================================================================
  // Schema Methods
  // ============================================================================

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  // ============================================================================
  // Component State
  // ============================================================================

  async getComponentState(): Promise<SpecialWordsComponentState> {
    if (!this.context) {
      return { usersLeaderboard: [], allWordsLeaderboard: [] }
    }

    const [rawUsersLeaderboard, allWordsLeaderboard] = await Promise.all([
      this.context.storage.zrangeWithScores(USER_WORD_COUNT_KEY, 0, -1),
      this.context.storage.zrangeWithScores(WORD_RANK_KEY, 0, -1),
    ])

    // Hydrate user leaderboard with usernames (includes users who have left)
    const userIds = rawUsersLeaderboard.map((entry) => entry.value)
    const users = await this.context.api.getUsersByIds(userIds)
    const userMap = new Map(users.map((u) => [u.userId, u.username]))

    const usersLeaderboard = rawUsersLeaderboard.map((entry) => ({
      ...entry,
      username: userMap.get(entry.value) ?? entry.value, // Fallback to userId if user not found
    }))

    return {
      usersLeaderboard,
      allWordsLeaderboard,
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    this.on("MESSAGE_RECEIVED", this.onMessageReceived.bind(this))
    this.onConfigChange(this.handleConfigChange.bind(this))
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async onMessageReceived(data: SystemEventPayload<"MESSAGE_RECEIVED">): Promise<void> {
    const config = await this.getConfig()
    if (!config?.enabled) return

    const { message } = data
    if (this.isSystemMessage(message)) return

    const detectedWords = this.detectSpecialWords(message.content, config.words)
    for (const word of detectedWords) {
      await this.handleSpecialWord(word, message, config)
    }
  }

  private async handleConfigChange(data: {
    roomId: string
    pluginName: string
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }): Promise<void> {
    const wasEnabled = data.previousConfig?.enabled === true
    const isEnabled = data.config?.enabled === true

    if (wasEnabled !== isEnabled) {
      console.log(`[${this.name}] Enabled changed: ${wasEnabled} -> ${isEnabled}`)
    }
  }

  // ============================================================================
  // Word Detection & Processing
  // ============================================================================

  private async handleSpecialWord(
    word: string,
    message: ChatMessage,
    config: SpecialWordsConfig,
  ): Promise<void> {
    if (!this.context) return

    const { user } = message
    const { userId, username } = user
    if (!userId) return

    // Update statistics
    await this.updateWordStatistics(userId, word)

    // Fetch data for message and event
    const stats = await this.fetchWordStatistics(userId, word)

    // Send system message if enabled
    if (config.sendMessageOnDetection) {
      await this.sendDetectionMessage(word, user, stats, config)
    }

    // Emit plugin event to frontend
    await this.emitWordDetected(word, userId, username, message.timestamp, stats)

    if (config.soundEffectOnDetection) {
      await this.playSoundEffect(config)
    }
    await this.context.api.queueScreenEffect({
      target: "message",
      targetId: message.timestamp,
      effect: "headShake",
      duration: 1000,
    })
    await this.context.api.queueScreenEffect({
      target: "plugin",
      targetId: "leaderboard-button",
      effect: "pulse",
      duration: 500,
    })
  }

  private detectSpecialWords(content: string, configWords: string[]): string[] {
    const words = content.toLowerCase().split(/\s+/)
    const configWordsSet = new Set(configWords.map((w) => this.normalizeWord(w)))

    return words
      .map((word) => this.normalizeWord(word))
      .filter((word) => word && configWordsSet.has(word))
  }

  // ============================================================================
  // Statistics Management
  // ============================================================================

  private async updateWordStatistics(userId: string, word: string): Promise<void> {
    if (!this.context) return

    const normalizedWord = this.normalizeWord(word)

    await Promise.all([
      // Increment uses of any special word by this user
      this.context.storage.zincrby(USER_WORD_COUNT_KEY, 1, userId),
      // Increment rank of this word
      this.context.storage.zincrby(WORD_RANK_KEY, 1, normalizedWord),
      // Increment how many times this word has been used by this user
      this.context.storage.zincrby(`${WORDS_PER_USER_KEY}:${userId}`, 1, normalizedWord),
    ])
  }

  private async fetchWordStatistics(
    userId: string,
    word: string,
  ): Promise<{
    userAllWordsCount: number
    userRank: number
    userThisWordCount: number
    usersLeaderboard: { score: number; value: string }[]
    allWordsLeaderboard: { score: number; value: string }[]
    thisWordCount: number
    totalWordsUsed: number
    thisWordRank: number
  }> {
    if (!this.context) {
      return {
        userAllWordsCount: 0,
        userRank: -1,
        userThisWordCount: 0,
        usersLeaderboard: [],
        allWordsLeaderboard: [],
        thisWordCount: 0,
        totalWordsUsed: 0,
        thisWordRank: -1,
      }
    }

    const normalizedWord = this.normalizeWord(word)

    const [
      userAllWordsCount,
      userRank,
      userThisWordCount,
      usersLeaderboard,
      allWordsLeaderboard,
      thisWordCount,
      thisWordRank,
    ] = await Promise.all([
      this.context.storage.zscore(USER_WORD_COUNT_KEY, userId),
      this.context.storage.zrevrank(USER_WORD_COUNT_KEY, userId),
      this.context.storage.zscore(`${WORDS_PER_USER_KEY}:${userId}`, normalizedWord),
      this.context.storage.zrangeWithScores(USER_WORD_COUNT_KEY, 0, -1),
      this.context.storage.zrangeWithScores(WORD_RANK_KEY, 0, -1),
      this.context.storage.zscore(WORD_RANK_KEY, normalizedWord),
      this.context.storage.zrevrank(WORD_RANK_KEY, normalizedWord),
    ])

    const totalWordsUsed = usersLeaderboard.reduce((acc, curr) => acc + curr.score, 0)

    return {
      userAllWordsCount: userAllWordsCount ?? 0,
      userRank: userRank ?? -1,
      userThisWordCount: userThisWordCount ?? 0,
      usersLeaderboard,
      allWordsLeaderboard,
      thisWordCount: thisWordCount ?? 0,
      totalWordsUsed,
      thisWordRank: thisWordRank ?? -1,
    }
  }

  // ============================================================================
  // Messaging
  // ============================================================================

  private async sendDetectionMessage(
    word: string,
    user: User,
    stats: Awaited<ReturnType<typeof this.fetchWordStatistics>>,
    config: SpecialWordsConfig,
  ): Promise<void> {
    if (!this.context) return

    const message = this.interpolateMessage(word, user, stats, config)
    await this.context.api.sendSystemMessage(this.context.roomId, message)
  }

  private interpolateMessage(
    word: string,
    user: User,
    stats: Awaited<ReturnType<typeof this.fetchWordStatistics>>,
    config: SpecialWordsConfig,
  ): string {
    return interpolateTemplate(config.messageTemplate ?? "", {
      word,
      username: user.username,
      userId: user.userId,
      userRank: stats.userRank + 1,
      userAllWordsCount: stats.userAllWordsCount,
      totalWordsUsed: stats.totalWordsUsed,
      thisWordCount: stats.thisWordCount,
      thisWordRank: stats.thisWordRank + 1,
      userThisWordCount: stats.userThisWordCount,
    })
  }

  // ============================================================================
  // Event Emission
  // ============================================================================

  private async emitWordDetected(
    word: string,
    userId: string,
    username: string | undefined,
    messageTimestamp: string,
    stats: Awaited<ReturnType<typeof this.fetchWordStatistics>>,
  ): Promise<void> {
    await this.emit<SpecialWordsEvents["SPECIAL_WORD_DETECTED"]>("SPECIAL_WORD_DETECTED", {
      word,
      userId,
      username: username ?? undefined,
      messageTimestamp,
      userRank: stats.userRank,
      userAllWordsCount: stats.userAllWordsCount,
      userThisWordCount: stats.userThisWordCount,
      totalWordsUsed: stats.totalWordsUsed,
      thisWordCount: stats.thisWordCount,
      thisWordRank: stats.thisWordRank,
      usersLeaderboard: stats.usersLeaderboard,
      allWordsLeaderboard: stats.allWordsLeaderboard,
    })
  }

  private async playSoundEffect(config: SpecialWordsConfig): Promise<void> {
    if (!this.context) return

    await this.context.api.queueSoundEffect({
      url: config.soundEffectOnDetectionUrl,
      volume: 0.6,
    })
  }

  // ============================================================================
  // Augmentation
  // ============================================================================

  async augmentRoomExport(exportData: RoomExportData): Promise<PluginExportAugmentation> {
    // Count words that were detected by this plugin
    const state = await this.getComponentState()
    const config = await this.getConfig()

    const title = `${config?.wordLabel ?? "Special Words"} Stats`

    // Build a combined user lookup map from userHistory (preferred) and current users
    // userHistory includes users who have left; current users may have updated names
    const allUsers = [...(exportData.userHistory || []), ...exportData.users]
    const userMap = new Map(allUsers.map((u) => [u.userId, u.username]))

    const hydratedUserLeaderboard = state.usersLeaderboard.map((item) => {
      return {
        userId: item.value,
        username: userMap.get(item.value) ?? item.value,
        wordCount: item.score,
      }
    })

    return {
      // Data added to export.pluginExports["special-words"]
      data: {
        usersLeaderboard: hydratedUserLeaderboard,
        allWordsLeaderboard: state.allWordsLeaderboard,
      },

      // Additional markdown sections appended to export
      markdownSections: [
        `## ${title}\n\n` +
          `### Users Leaderboard \n${hydratedUserLeaderboard.map((item, index) => `${index + 1}. ${item.username}: ${item.wordCount}`).join("\n")}\n` +
          `### All Words Leaderboard \n${state.allWordsLeaderboard.map((item, index) => `${index + 1}. ${item.value}: ${item.score}`).join("\n")}\n`,
      ],
    }
  }
  // ============================================================================
  // Actions
  // ============================================================================

  async executeAction(action: string): Promise<{ success: boolean; message?: string }> {
    if (action === "resetLeaderboards") {
      return this.resetLeaderboards()
    }
    return { success: false, message: `Unknown action: ${action}` }
  }

  private async resetLeaderboards(): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }

    try {
      // Get all users from the leaderboard to clean up their per-user word counts
      const usersLeaderboard = await this.context.storage.zrangeWithScores(
        USER_WORD_COUNT_KEY,
        0,
        -1,
      )

      // Delete per-user word count keys
      for (const entry of usersLeaderboard) {
        await this.context.storage.del(`${WORDS_PER_USER_KEY}:${entry.value}`)
      }

      // Delete the main leaderboard keys by removing all entries
      const allUserIds = usersLeaderboard.map((e) => e.value)
      for (const userId of allUserIds) {
        await this.context.storage.zrem(USER_WORD_COUNT_KEY, userId)
      }

      const allWordsLeaderboard = await this.context.storage.zrangeWithScores(WORD_RANK_KEY, 0, -1)
      const allWords = allWordsLeaderboard.map((e) => e.value)
      for (const word of allWords) {
        await this.context.storage.zrem(WORD_RANK_KEY, word)
      }

      console.log(`[${this.name}] Leaderboards reset for room ${this.context.roomId}`)

      // Emit an event to update the frontend with empty leaderboards
      // Include the store keys so the frontend machine updates its store
      await this.emit("LEADERBOARDS_RESET", {
        usersLeaderboard: [],
        allWordsLeaderboard: [],
      })

      return { success: true, message: "Leaderboards have been reset" }
    } catch (error) {
      console.error(`[${this.name}] Error resetting leaderboards:`, error)
      return { success: false, message: `Error resetting leaderboards: ${error}` }
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private normalizeWord(word: string): string {
    // Remove leading/trailing punctuation, then lowercase and trim
    return word
      .toLowerCase()
      .trim()
      .replace(/^[^\w]+|[^\w]+$/g, "")
  }

  private isSystemMessage(message: ChatMessage): boolean {
    return message.user.userId === "system"
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory function to create the plugin.
 * A new instance is created for each room.
 *
 * @param configOverrides - Optional partial config to override defaults
 */
export function createSpecialWordsPlugin(configOverrides?: Partial<SpecialWordsConfig>): Plugin {
  return new SpecialWordsPlugin(configOverrides)
}

export default createSpecialWordsPlugin
