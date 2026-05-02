import { z } from "zod"
import {
  ShopPlugin,
  type ShopItem,
  ECHO_FLAG,
  GROW_FLAG,
  SHRINK_FLAG,
  applyTextEffects,
  countTextEffectStacks,
} from "@repo/plugin-base"
import {
  type ChatMessage,
  type GameStateEffectWithMeta,
  type Plugin,
  type PluginConfigSchema,
  type PluginComponentSchema,
  type InventoryItem,
  type ItemDefinition,
  type ItemUseResult,
} from "@repo/types"
import packageJson from "./package.json"
import {
  musicShopConfigSchema,
  defaultMusicShopConfig,
  buildMusicShopItems,
  buildMusicShopOfferRows,
  musicShopComponentStoreKeys,
  type MusicShopConfig,
  SCRATCHED_CD_SHORT_ID,
  ANALOG_DELAY_SHORT_ID,
  COMPRESSOR_SHORT_ID,
  BOOST_SHORT_ID,
} from "./types"
export type { MusicShopConfig } from "./types"
export {
  musicShopConfigSchema,
  defaultMusicShopConfig,
  buildMusicShopItems,
  buildMusicShopOfferRows,
  musicShopComponentStoreKeys,
  MUSIC_SHOP_CATALOG,
  getMusicShopCatalogEntry,
  requireMusicShopCatalogEntry,
} from "./types"

const PLUGIN_NAME = "music-shop"

export class MusicShopPlugin extends ShopPlugin<MusicShopConfig> {
  name = PLUGIN_NAME
  version = packageJson.version
  description = "In-room shop where users spend coins on items."

  // Cast avoids duplicate zod installs resolving to different `z` module instances under npm workspaces.
  static readonly configSchema = musicShopConfigSchema as any
  static readonly defaultConfig = defaultMusicShopConfig

  protected shopItems: ShopItem[] = buildMusicShopItems()
  protected defaultSellQuoteShortId = SCRATCHED_CD_SHORT_ID

  protected isShopEnabled(config: MusicShopConfig): boolean {
    return config.enabled
  }

  protected isSellingItems(config: MusicShopConfig): boolean {
    return config.isSellingItems
  }

  protected shopClosedMessage(): string {
    return "The Music Shop is closed."
  }

  protected notSellingMessage(): string {
    return "The Music Shop is not selling items right now."
  }

  // ==========================================================================
  // Schemas
  // ==========================================================================

  getConfigSchema(): PluginConfigSchema {
    return {
      jsonSchema: (
        z as unknown as { toJSONSchema: (s: unknown) => Record<string, unknown> }
      ).toJSONSchema(musicShopConfigSchema),
      layout: [
        { type: "heading", content: "Music Shop" },
        {
          type: "text-block",
          content:
            "Lets users spend `coin` on items that affect playback. Stock resets at the start of each game session.",
          variant: "info",
        },
        "enabled",
        "isSellingItems",
        "echoDurationMs",
        {
          type: "action",
          action: "restock",
          label: "Restock shop now",
          variant: "outline",
          confirmMessage:
            "Reset the available stock for every shop item to its configured starting quantity?",
          confirmText: "Restock",
          showWhen: { field: "enabled", value: true },
        },
      ],
      fieldMeta: {
        enabled: {
          type: "boolean",
          label: "Enable Music Shop",
          description:
            "When enabled, users can use shop items they own. Disable to fully turn off the plugin.",
        },
        isSellingItems: {
          type: "boolean",
          label: "Sell items in shop",
          description:
            "When off, the Shop tab is hidden and purchases are blocked, but users can still use and sell items they already own.",
          showWhen: { field: "enabled", value: true },
        },
        echoDurationMs: {
          type: "duration",
          label: "Analog Delay duration",
          description:
            "How long the chat echo effect lasts when someone uses an Analog Delay Pedal.",
          displayUnit: "minutes",
          storageUnit: "milliseconds",
          showWhen: { field: "enabled", value: true },
        },
      },
    }
  }

  getComponentSchema(): PluginComponentSchema {
    return {
      components: [
        {
          id: "music-shop-tab",
          type: "tab",
          area: "gameStateTab",
          label: "Music Shop",
          icon: "shopping-cart",
          // Tab is only shown when the plugin is enabled AND actively selling.
          // Items are still usable when isSellingItems is off; only the
          // shop UI is hidden.
          showWhen: [
            { field: "enabled", value: true },
            { field: "isSellingItems", value: true },
          ],
          children: [
            {
              id: "music-shop-offers",
              type: "shop-offer-table",
              area: "gameStateTab",
              rows: buildMusicShopOfferRows(),
            },
          ],
        },
      ],
      storeKeys: musicShopComponentStoreKeys(),
    }
  }

  // ==========================================================================
  // Inventory hooks (item-specific behavior)
  // ==========================================================================

  /**
   * Apply a timed flag modifier to a target user (self or chosen), announce in chat.
   */
  private async applyTargetedTimedModifier(
    userId: string,
    callContext: unknown,
    definition: ItemDefinition,
    effectDurationMs: number,
    spec: {
      modifierName: string
      effects: GameStateEffectWithMeta[]
      successMessage: string
      describe: (p: { isSelf: boolean; actor: string; target: string }) => string
    },
  ): Promise<ItemUseResult> {
    if (!this.context) {
      return { success: false, consumed: false, message: "Plugin not initialized" }
    }
    const targetUserId =
      (callContext as { targetUserId?: string } | undefined)?.targetUserId ?? userId
    const roomUsers = await this.context.api.getUsers(this.context.roomId)
    if (!roomUsers.some((u) => u.userId === targetUserId)) {
      return { success: false, consumed: false, message: "That user is not in this room." }
    }

    await this.game.applyTimedModifier(targetUserId, effectDurationMs, {
      name: spec.modifierName,
      effects: spec.effects,
      stackBehavior: "stack",
      itemDefinitionId: definition.id,
    })

    const [actor] = await this.context.api.getUsersByIds([userId])
    const [target] = await this.context.api.getUsersByIds([targetUserId])
    const actorName = actor?.username?.trim() || userId
    const targetName = target?.username?.trim() || targetUserId
    const isSelf = targetUserId === userId
    const who = spec.describe({ isSelf, actor: actorName, target: targetName })
    await this.context.api.sendSystemMessage(
      this.context.roomId,
      `${who} (${definition.name} — ${Math.round(effectDurationMs / 60_000)} min).`,
    )
    return { success: true, consumed: true, message: spec.successMessage }
  }

  async onItemUsed(
    userId: string,
    _item: InventoryItem,
    definition: ItemDefinition,
    callContext?: unknown,
  ): Promise<ItemUseResult> {
    if (!this.context) {
      return { success: false, consumed: false, message: "Plugin not initialized" }
    }
    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, consumed: false, message: this.shopClosedMessage() }
    }

    if (definition.shortId === SCRATCHED_CD_SHORT_ID) {
      const np = await this.context.api.getNowPlaying(this.context.roomId)
      if (!np?.mediaSource?.trackId) {
        return { success: false, consumed: false, message: "Nothing is playing right now." }
      }

      try {
        await this.context.api.skipTrack(this.context.roomId, np.mediaSource.trackId)
      } catch (err) {
        console.error(`[${this.name}] skipTrack failed`, err)
        return { success: false, consumed: false, message: "Could not skip the track." }
      }

      const [user] = await this.context.api.getUsersByIds([userId])
      const username = user?.username?.trim() || userId
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `${username} used a Skip Token!`,
      )

      return { success: true, consumed: true, message: "Skipped!" }
    }

    if (definition.shortId === ANALOG_DELAY_SHORT_ID) {
      return this.applyTargetedTimedModifier(
        userId,
        callContext,
        definition,
        config.effectDurationMs,
        {
          modifierName: "analog_delay_echo",
          effects: [
            {
              type: "flag",
              name: ECHO_FLAG,
              value: true,
              icon: "square-stack",
              intent: "negative",
            },
          ],
          successMessage: "Echo engaged. It was lost with use.",
          describe: ({ isSelf, actor, target }) =>
            isSelf ? `${actor} is hearing echoes` : `${target}'s chat echoes`,
        },
      )
    }

    if (definition.shortId === COMPRESSOR_SHORT_ID) {
      return this.applyTargetedTimedModifier(
        userId,
        callContext,
        definition,
        config.effectDurationMs,
        {
          modifierName: "compressor",
          effects: [
            { type: "flag", name: SHRINK_FLAG, value: true, icon: "shrink", intent: "negative" },
          ],
          successMessage: "Compressor engaged. It was lost with use.",
          describe: ({ isSelf, actor, target }) =>
            isSelf ? `${actor} is compressed` : `${target} has been compressed`,
        },
      )
    }

    if (definition.shortId === BOOST_SHORT_ID) {
      return this.applyTargetedTimedModifier(
        userId,
        callContext,
        definition,
        config.effectDurationMs,
        {
          modifierName: "boost",
          effects: [
            { type: "flag", name: GROW_FLAG, value: true, icon: "chevrons-up", intent: "positive" },
          ],
          successMessage: "Boost engaged. It was lost with use.",
          describe: ({ isSelf, actor, target }) =>
            isSelf ? `${actor} is boosted` : `${target} is boosted`,
        },
      )
    }

    return { success: false, consumed: false, message: `Unknown item: ${definition.shortId}` }
  }

  async transformChatMessage(roomId: string, message: ChatMessage): Promise<ChatMessage | null> {
    if (!this.context || roomId !== this.context.roomId) return null
    const config = await this.getConfig()
    if (!config?.enabled) return null

    const state = await this.game.getUserState(message.user.userId)
    if (!state) return null

    const stacks = countTextEffectStacks(state.modifiers, Date.now())
    const result = applyTextEffects(message.content, stacks)
    if (!result) return null

    return { ...message, content: result.content, contentSegments: result.contentSegments }
  }
}

export function createMusicShopPlugin(configOverrides?: Partial<MusicShopConfig>): Plugin {
  return new MusicShopPlugin(configOverrides)
}

export default createMusicShopPlugin
