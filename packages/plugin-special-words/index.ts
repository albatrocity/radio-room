import type { Plugin, PluginContext, SystemEventPayload, ChatMessage } from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import packageJson from "./package.json"

import type { SpecialWordsConfig } from "./types"
export type { SpecialWordsConfig } from "./types"

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
  description = "A plugin detects special words in chat messages"

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
 */
export function createSpecialWordsPlugin(): Plugin {
  return new SpecialWordsPlugin()
}

export default createSpecialWordsPlugin
