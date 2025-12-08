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
import { PluginExportAugmentation, RoomExportData } from "../../node_modules/@repo/types/RoomExport"

export type { SpecialWordsConfig } from "./types"
export { specialWordsConfigSchema, defaultSpecialWordsConfig } from "./types"

// ============================================================================
// Component State Type
// ============================================================================

interface LeaderboardEntry {
  score: number
  value: string
}

export interface SpecialWordsComponentState extends Record<string, unknown> {
  usersLeaderboard: LeaderboardEntry[]
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

    const [usersLeaderboard, allWordsLeaderboard] = await Promise.all([
      this.context.storage.zrangeWithScores(USER_WORD_COUNT_KEY, 0, -1),
      this.context.storage.zrangeWithScores(WORD_RANK_KEY, 0, -1),
    ])

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
  }

  private detectSpecialWords(content: string, configWords: string[]): string[] {
    const words = content.toLowerCase().split(/\s+/)
    const configWordsSet = new Set(configWords.map((w) => this.normalizeWord(w)))

    return words.filter((word) => configWordsSet.has(word))
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

  // ============================================================================
  // Augmentation
  // ============================================================================

  async augmentRoomExport(exportData: RoomExportData): Promise<PluginExportAugmentation> {
    // Count words that were detected by this plugin
    const state = await this.getComponentState()
    console.log("state", state)
    const config = await this.getConfig()

    // state = {
    //      usersLeaderboard: [
    //        { value: '1243633676', score: 1 },
    //        { value: '81a261eef2822c00640094286cf79913', score: 2 }
    //   ],
    //   allWordsLeaderboard: [ { value: 'poot', score: 1 }, { value: 'proot', score: 2 } ]
    //   }

    const title = `${config?.wordLabel ?? "Special Words"} Stats`

    const hydratedUserLeaderboard = state.usersLeaderboard.map((item) => {
      return {
        userId: item.value,
        username:
          exportData.users.find((user) => user.userId === item.value)?.username ?? item.value,
        wordCount: item.score,
      }
    })

    return {
      // Data added to export.pluginExports["playlist-democracy"]
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
  // Helpers
  // ============================================================================

  private normalizeWord(word: string): string {
    return word.toLowerCase().trim()
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
