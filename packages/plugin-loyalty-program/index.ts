import type { Plugin, PluginConfigSchema, PluginContext, User } from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import { interpolateTemplate } from "@repo/utils"
import packageJson from "./package.json"
import {
  loyaltyProgramConfigSchema,
  defaultLoyaltyProgramConfig,
  type LoyaltyProgramConfig,
  type LoyaltySessionRecord,
} from "./types"
import { getConfigSchema } from "./schema"

export type { LoyaltyProgramConfig } from "./types"
export { loyaltyProgramConfigSchema, defaultLoyaltyProgramConfig } from "./types"

const PLUGIN_NAME = "loyalty-program"
const TICK_ID = "loyalty-program-tick"
const MAX_PAYOUTS_PER_USER_PER_TICK = 24

function parseConnectedAtMs(user: User): number | null {
  if (!user.connectedAt) return null
  const t = Date.parse(user.connectedAt)
  return Number.isFinite(t) ? t : null
}

export class LoyaltyProgramPlugin extends BasePlugin<LoyaltyProgramConfig> {
  name = PLUGIN_NAME
  version = packageJson.version
  description = "Loyalty Program — awards coins for time spent in the room."

  static readonly configSchema = loyaltyProgramConfigSchema as any
  static readonly defaultConfig = defaultLoyaltyProgramConfig

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  private storageKey(userId: string): string {
    return `loyalty:user:${userId}`
  }

  private async loadRecord(userId: string): Promise<LoyaltySessionRecord | null> {
    if (!this.context) return null
    const raw = await this.context.storage.get(this.storageKey(userId))
    if (!raw) return null
    try {
      return JSON.parse(raw) as LoyaltySessionRecord
    } catch {
      return null
    }
  }

  private async saveRecord(userId: string, record: LoyaltySessionRecord): Promise<void> {
    if (!this.context) return
    await this.context.storage.set(this.storageKey(userId), JSON.stringify(record))
  }

  private buildRecord(
    user: User,
    gameSessionId: string,
    config: LoyaltyProgramConfig,
  ): LoyaltySessionRecord {
    const intervalMs = config.intervalMinutes * 60_000
    const minMs = config.minSessionMinutes * 60_000
    const anchor = parseConnectedAtMs(user) ?? Date.now()
    return {
      sessionAnchorMs: anchor,
      intervalsPaid: 0,
      nextAwardDueMs: anchor + Math.max(intervalMs, minMs),
      gameSessionId,
    }
  }

  private async ensureRecord(
    user: User,
    gameSessionId: string,
    config: LoyaltyProgramConfig,
  ): Promise<LoyaltySessionRecord> {
    const existing = await this.loadRecord(user.userId)
    if (existing && existing.gameSessionId === gameSessionId) {
      return existing
    }
    const created = this.buildRecord(user, gameSessionId, config)
    await this.saveRecord(user.userId, created)
    return created
  }

  private coinAmountForPayout(intervalsPaidBefore: number, config: LoyaltyProgramConfig): number {
    return config.baseCoins + config.scaleBonusPerInterval * intervalsPaidBefore
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)
    this.on("USER_JOINED", (data) => {
      void this.onUserJoined(data)
    })
    this.onConfigChange(() => {
      void this.handlePluginConfigChange()
    })
    await this.restartTickSchedule()
  }

  private async handlePluginConfigChange(): Promise<void> {
    this.clearTimer(TICK_ID)
    await this.restartTickSchedule()
  }

  private async restartTickSchedule(): Promise<void> {
    const config = await this.getConfig()
    if (!this.context || !config?.enabled) return
    const duration = config.intervalMinutes * 60_000
    this.startTimer(TICK_ID, {
      duration,
      callback: async () => {
        await this.onTick()
        await this.restartTickSchedule()
      },
    })
  }

  private async onUserJoined(data: { user: User }): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return
    const session = await this.context.game.getActiveSession()
    if (!session) return
    await this.ensureRecord(data.user, session.id, config)
  }

  private async onTick(): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return
    const session = await this.context.game.getActiveSession()
    if (!session) return
    const roomId = this.context.roomId
    const now = Date.now()
    const users = await this.context.api.getUsers(roomId)
    const intervalMs = config.intervalMinutes * 60_000

    for (const user of users) {
      if (!user.userId) continue
      let record = await this.ensureRecord(user, session.id, config)
      let payouts = 0
      while (now >= record.nextAwardDueMs && payouts < MAX_PAYOUTS_PER_USER_PER_TICK) {
        const coins = this.coinAmountForPayout(record.intervalsPaid, config)
        const sessionMs = now - record.sessionAnchorMs
        if (coins > 0) {
          await this.context.game.addScore(user.userId, "coin", coins, `${PLUGIN_NAME}:loyalty`)

          if (config.messageTemplate && config.messageTemplate.trim() !== "") {
            const body = interpolateTemplate(config.messageTemplate, {
              coins: String(coins),
              username: user.username ?? user.userId,
              sessionMs,
              intervalMinutes: String(config.intervalMinutes),
            })
            await this.context.api.sendUserSystemMessage(roomId, user.userId, body)
          }
        }
        record.intervalsPaid += 1
        record.nextAwardDueMs += intervalMs
        payouts += 1
        await this.saveRecord(user.userId, record)
      }
    }
  }
}

export function createLoyaltyProgramPlugin(
  configOverrides?: Partial<LoyaltyProgramConfig>,
): Plugin {
  return new LoyaltyProgramPlugin(configOverrides)
}

export default createLoyaltyProgramPlugin
