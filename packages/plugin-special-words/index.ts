import { z } from "zod"
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
import packageJson from "./package.json"

import {
  specialWordsConfigSchema,
  defaultSpecialWordsConfig,
  type SpecialWordsConfig,
} from "./types"
import { interpolateTemplate } from "@repo/utils"

export type { SpecialWordsConfig } from "./types"
export { specialWordsConfigSchema, defaultSpecialWordsConfig } from "./types"

const USER_WORD_COUNT_KEY = "user-word-count"
const WORDS_PER_USER_KEY = "words-per-user"
const WORD_RANK_KEY = "word-rank"

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

export class SpecialWordsPlugin extends BasePlugin<SpecialWordsConfig> {
  name = "special-words"
  version = packageJson.version
  description = "Detect special words in chat messages and emit events when they are found."

  // Static schema and defaults for BasePlugin
  static readonly configSchema = specialWordsConfigSchema
  static readonly defaultConfig = defaultSpecialWordsConfig

  /**
   * Get the UI schema for dynamic form generation
   */
  getConfigSchema(): PluginConfigSchema {
    return {
      jsonSchema: z.toJSONSchema(specialWordsConfigSchema),
      layout: [
        { type: "heading", content: "Special Words" },
        {
          type: "text-block",
          content: "Detect special words in chat messages and send alerts when they are found.",
          variant: "info",
        },
        "enabled",
        "words",
        "wordLabel",
        "sendMessageOnDetection",
        "messageTemplate",
      ],
      fieldMeta: {
        enabled: {
          type: "boolean",
          label: "Enable Special Words Detection",
          description: "When enabled, the plugin will monitor chat for special words",
        },
        words: {
          type: "string-array",
          label: "Words to Detect",
          description: "List of words to watch for in chat messages (case-insensitive)",
          placeholder: "Enter a word and press Enter",
          showWhen: {
            field: "enabled",
            value: true,
          },
        },
        wordLabel: {
          type: "string",
          label: "Word Label",
          description: "The label to use for 'word' for this plugin",
          placeholder: "Word",
          showWhen: {
            field: "enabled",
            value: true,
          },
        },
        sendMessageOnDetection: {
          type: "boolean",
          label: "Send Message on Detection",
          description:
            "When enabled, the plugin will send a message when a special word is detected",
          showWhen: {
            field: "enabled",
            value: true,
          },
        },
        messageTemplate: {
          type: "string",
          description:
            "Available variables: {{word}}, {{user}}, {{message}}, {{userRank}}, {{userAllWordsCount}}, {{userThisWordCount}}, {{totalWordsUsed}}, {{thisWordCount}}, {{thisWordRank}}",

          label: "Message Template",
          showWhen: [
            {
              field: "enabled",
              value: true,
            },
            {
              field: "sendMessageOnDetection",
              value: true,
            },
          ],
        },
      },
    }
  }

  /**
   * Get the UI component schema for frontend rendering
   */
  getComponentSchema(): PluginComponentSchema {
    return {
      components: [
        // Button to open the leaderboard modal
        {
          id: "leaderboard-button",
          type: "button",
          area: "userList",
          label: "{{config.wordLabel}} Leaderboard",
          icon: "trophy",
          opensModal: "leaderboard-modal",
          enabledWhen: "enabled",
          variant: "ghost",
          size: "sm",
        },
        {
          id: "now-playing",
          type: "text",
          area: "nowPlaying",
          content: "Now Playing!",
        },
        {
          id: "now-playing-info",
          type: "text",
          area: "nowPlayingInfo",
          content: "Now Playing Info!",
        },
        {
          id: "now-playing-art",
          area: "nowPlayingArt",
          type: "text",
          content: "Now Playing Art!",
        },
        {
          id: "playlist-item",
          area: "playlistItem",
          type: "text",
          content: "Playlist Item",
        },
        {
          id: "userListItem",
          area: "userListItem",
          type: "text",
          content: "User List Item",
        },
        // Modal containing leaderboards
        {
          id: "leaderboard-modal",
          type: "modal",
          area: "userList",
          title: "{{config.wordLabel}} Leaderboard",
          size: "md",
          children: [
            {
              id: "users-leaderboard",
              type: "leaderboard",
              area: "userList",
              dataKey: "usersLeaderboard",
              title: "Top {{config.wordLabel:pluralize:2}} Users",
              rowTemplate: [
                { type: "component", name: "username", props: { userId: "{{value}}" } },
                { type: "text", content: ": {{score}} {{config.wordLabel:pluralize:score}}" },
              ],
              maxItems: 10,
              showRank: true,
            },
            {
              id: "words-leaderboard",
              type: "leaderboard",
              area: "userList",
              dataKey: "allWordsLeaderboard",
              title: "Most Used {{config.wordLabel:pluralize:2}}",
              rowTemplate: '"{{value}}" - {{score}} uses',
              maxItems: 10,
              showRank: true,
            },
          ],
        },
      ],
      // Store keys that get updated from plugin events
      storeKeys: ["usersLeaderboard", "allWordsLeaderboard"],
    }
  }

  /**
   * Get the current component state for hydration on room join
   */
  async getComponentState(): Promise<PluginComponentState> {
    if (!this.context) return {}

    const usersLeaderboard = await this.context.storage.zrangeWithScores(USER_WORD_COUNT_KEY, 0, -1)
    const allWordsLeaderboard = await this.context.storage.zrangeWithScores(WORD_RANK_KEY, 0, -1)

    return {
      usersLeaderboard,
      allWordsLeaderboard,
    }
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    // Register for lifecycle events using this.on() for type-safe payloads
    this.on("MESSAGE_RECEIVED", this.onMessageReceived.bind(this))

    // Use filtered config change handler (only receives changes for THIS plugin)
    this.onConfigChange(async (data) => {
      const wasEnabled = data.previousConfig?.enabled === true
      const isEnabled = data.config?.enabled === true

      if (wasEnabled !== isEnabled) {
        console.log(`[${this.name}] Enabled changed: ${wasEnabled} -> ${isEnabled}`)
      }
    })
  }

  private async onMessageReceived(data: SystemEventPayload<"MESSAGE_RECEIVED">): Promise<void> {
    const config = await this.getConfig()
    if (!config?.enabled) return

    const { message } = data
    if (message.user.userId === "system") return

    const words = message.content.toLowerCase().split(/\s+/)
    const configWords = new Set(config.words.map((w) => this.normalizeWord(w)))

    for (const word of words) {
      if (configWords.has(word)) {
        await this.handleSpecialWord(word, message)
      }
    }
  }

  private async handleSpecialWord(word: string, message: ChatMessage): Promise<void> {
    if (!this.context) return
    const { user } = message
    const { userId, username } = user
    const config = await this.getConfig()

    if (!userId) return
    if (!config?.enabled) return

    // Increment uses of any special word by this user
    await this.context.storage.zincrby(USER_WORD_COUNT_KEY, 1, userId)
    // Increment rank of this word
    await this.context.storage.zincrby(WORD_RANK_KEY, 1, this.normalizeWord(word))

    // Incrememnt how many times this word has been used by this user
    await this.context.storage.zincrby(
      `${WORDS_PER_USER_KEY}:${userId}`,
      1,
      this.normalizeWord(word),
    )

    // Fetch data for message
    const userAllWordsCount =
      (await this.context?.storage.zscore(USER_WORD_COUNT_KEY, user.userId)) ?? 0
    const userRank = (await this.context.storage.zrevrank(USER_WORD_COUNT_KEY, user.userId)) ?? -1

    const userThisWordCount =
      (await this.context?.storage.zscore(`${WORDS_PER_USER_KEY}:${user.userId}`, word)) ?? 0

    const usersLeaderboard = await this.context.storage.zrangeWithScores(USER_WORD_COUNT_KEY, 0, -1)

    const allWordsLeaderboard = await this.context.storage.zrangeWithScores(WORD_RANK_KEY, 0, -1)

    const thisWordCount =
      (await this.context.storage.zscore(WORD_RANK_KEY, this.normalizeWord(word))) ?? -1
    const totalWordsUsed = usersLeaderboard.reduce((acc, curr) => acc + curr.score, 0)
    const thisWordRank =
      (await this.context.storage.zrevrank(WORD_RANK_KEY, this.normalizeWord(word))) ?? -1

    if (config.sendMessageOnDetection) {
      await this.context.api.sendSystemMessage(
        this.context?.roomId,
        await this.makeSystemMessage({
          word,
          user,
          message,
          userRank,
          userAllWordsCount,
          userThisWordCount,
          totalWordsUsed,
          thisWordCount,
          thisWordRank,
        }),
      )
    }

    // Emit custom plugin event to frontend
    // Frontend receives: PLUGIN:special-words:SPECIAL_WORD_DETECTED
    await this.emit<SpecialWordsEvents["SPECIAL_WORD_DETECTED"]>("SPECIAL_WORD_DETECTED", {
      word,
      userId: userId,
      username: username ?? undefined,
      messageTimestamp: message.timestamp,
      userRank,
      userAllWordsCount,
      userThisWordCount,
      totalWordsUsed,
      thisWordCount,
      thisWordRank,
      usersLeaderboard,
      allWordsLeaderboard,
    })
  }

  private normalizeWord(word: string): string {
    return word.toLowerCase().trim()
  }

  private async makeSystemMessage(data: {
    word: string
    user: User
    message: ChatMessage
    userRank: number
    userAllWordsCount: number
    userThisWordCount: number
    totalWordsUsed: number
    thisWordCount: number
    thisWordRank: number
  }): Promise<string> {
    if (!this.context) throw new Error("Context not found")
    const {
      word,
      user,
      userRank,
      userAllWordsCount,
      totalWordsUsed,
      thisWordCount,
      thisWordRank,
      userThisWordCount,
    } = data
    const { username, userId } = user

    const config = await this.getConfig()
    const message = interpolateTemplate(config?.messageTemplate ?? "", {
      word,
      username,
      userId,
      userRank: userRank + 1,
      userAllWordsCount,
      totalWordsUsed,
      thisWordCount,
      thisWordRank: thisWordRank + 1,
      userThisWordCount,
    })

    return message
  }
}

/**
 * Factory function to create the plugin.
 * A new instance is created for each room.
 * @param configOverrides - Optional partial config to override defaults
 */
export function createSpecialWordsPlugin(configOverrides?: Partial<SpecialWordsConfig>): Plugin {
  return new SpecialWordsPlugin(configOverrides)
}

export default createSpecialWordsPlugin
