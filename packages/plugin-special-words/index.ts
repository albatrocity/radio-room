import { z } from "zod"
import type {
  Plugin,
  PluginContext,
  PluginConfigSchema,
  SystemEventPayload,
  ChatMessage,
} from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import packageJson from "./package.json"

import {
  specialWordsConfigSchema,
  defaultSpecialWordsConfig,
  type SpecialWordsConfig,
} from "./types"

export type { SpecialWordsConfig } from "./types"
export { specialWordsConfigSchema, defaultSpecialWordsConfig } from "./types"

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
          content:
            "Detect special words in chat messages and send alerts when they are found.",
          variant: "info",
        },
        "enabled",
        "words",
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
        },
      },
    }
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    // Register for lifecycle events using this.on() for type-safe payloads
    this.on("MESSAGE_RECEIVED", this.onMessageReceived.bind(this))

    this.on("CONFIG_CHANGED", async (data) => {
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
    const words = message.content.toLowerCase().split(/\s+/)
    const configWords = new Set(config.words.map((w) => w.toLowerCase()))

    for (const word of words) {
      if (configWords.has(word)) {
        await this.handleSpecialWord(word, message)
      }
    }
  }

  private async handleSpecialWord(word: string, message: ChatMessage): Promise<void> {
    if (!this.context) return

    this.context.api.sendSystemMessage(this.context?.roomId, `Special word detected: ${word}`, {
      status: "info",
      type: "alert",
    })
    // Emit custom plugin event to frontend
    // Frontend receives: PLUGIN:special-words:SPECIAL_WORD_DETECTED
    await this.emit<SpecialWordsEvents["SPECIAL_WORD_DETECTED"]>("SPECIAL_WORD_DETECTED", {
      word,
      userId: message.user.userId,
      username: message.user.username ?? undefined,
      messageTimestamp: message.timestamp,
    })
  }
}

/**
 * Factory function to create the plugin.
 * A new instance is created for each room.
 * @param configOverrides - Optional partial config to override defaults
 */
export function createSpecialWordsPlugin(
  configOverrides?: Partial<SpecialWordsConfig>,
): Plugin {
  return new SpecialWordsPlugin(configOverrides)
}

export default createSpecialWordsPlugin
