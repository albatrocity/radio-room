import type {
  Plugin,
  PluginActionInitiator,
  PluginConfigSchema,
  PluginContext,
} from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import {
  clampCostScale,
  median,
  nextCostScale,
  resolveEconomy,
  type EconomyControllerPolicy,
  type EconomySample,
} from "@repo/game-logic"
import packageJson from "./package.json"
import { getConfigSchema } from "./schema"
import {
  defaultTheFedConfig,
  theFedConfigSchema,
  type FedControllerState,
  type FedFlowState,
  type FedTickRecord,
  type TheFedConfig,
  type TheFedTickReason,
} from "./types"

export type { TheFedConfig } from "./types"
export { defaultTheFedConfig, theFedConfigSchema } from "./types"

const PLUGIN_NAME = "the-fed"
const TICK_ID = "the-fed-tick"
const TICKS_KEY = "ticks"
const CONTROLLER_KEY = "controller"
const FLOW_KEY = "flow"
const MAX_TICKS = 120
const TIMER_CONFIG_KEYS = ["enabled", "tickSeconds", "mode"] as const

function roundMetric(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0
  const f = 10 ** digits
  return Math.round(value * f) / f
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export class TheFedPlugin extends BasePlugin<TheFedConfig> {
  name = PLUGIN_NAME
  version = packageJson.version
  description = "The Fed — drives session costScale toward a target affordability."

  static readonly configSchema = theFedConfigSchema as any
  static readonly defaultConfig = defaultTheFedConfig

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)
    this.on("GAME_STATE_CHANGED", (data) => {
      void this.onGameStateChanged(data)
    })
    this.on("GAME_SESSION_STARTED", (data) => {
      void this.onSessionStarted(data.sessionId)
    })
    this.on("GAME_SESSION_ENDED", () => {
      void this.onSessionEnded()
    })
    this.onConfigChange((data) => {
      const restart = TIMER_CONFIG_KEYS.some(
        (key) => data.config[key] !== data.previousConfig[key],
      )
      if (restart) void this.restartTickSchedule()
    })
    await this.restartTickSchedule()
  }

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
    _params?: Record<string, unknown>,
  ): Promise<{ success: boolean; message?: string }> {
    const admin = await this.requireRoomAdminForAction(initiator)
    if (!admin.ok) return admin.result

    switch (action) {
      case "nudgeUp":
        return this.nudgeCostScale(1.1, "the-fed:nudge-up")
      case "nudgeDown":
        return this.nudgeCostScale(0.9, "the-fed:nudge-down")
      case "resetScale":
        return this.resetCostScale()
      case "forceTick":
        await this.onTick()
        return { success: true, message: "Fed tick complete." }
      case "exportMetrics":
        return this.exportMetrics(initiator)
      default:
        return super.executeAction(action, initiator, _params)
    }
  }

  private async restartTickSchedule(): Promise<void> {
    this.clearTimer(TICK_ID)
    const config = await this.getConfig()
    if (!this.context || !config?.enabled) return
    const duration = Math.max(15, config.tickSeconds) * 1000
    this.startTimer(TICK_ID, {
      duration,
      callback: async () => {
        await this.onTick()
        await this.restartTickSchedule()
      },
    })
  }

  private async onSessionStarted(sessionId: string): Promise<void> {
    await this.writeFlow({ netCoinFlow: 0, lastTickAt: Date.now(), sessionId })
    await this.writeController({ emaWealth: null, sessionId })
  }

  private async onSessionEnded(): Promise<void> {
    await this.writeFlow({ netCoinFlow: 0, lastTickAt: null, sessionId: null })
    await this.writeController({ emaWealth: null, sessionId: null })
  }

  private async onGameStateChanged(data: {
    sessionId: string
    changes: { attribute: string; previousValue?: number; value: number }[]
  }): Promise<void> {
    let delta = 0
    for (const change of data.changes) {
      if (change.attribute !== "coin") continue
      delta += change.value - (change.previousValue ?? 0)
    }
    if (delta === 0) return
    const flow = await this.readFlow()
    if (flow.sessionId && flow.sessionId !== data.sessionId) {
      flow.netCoinFlow = 0
      flow.sessionId = data.sessionId
    }
    flow.netCoinFlow += delta
    if (!flow.sessionId) flow.sessionId = data.sessionId
    await this.writeFlow(flow)
  }

  private async onTick(): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    if (!config?.enabled) return
    await this.serialize(() => this.runTick(config))
  }

  private async runTick(config: TheFedConfig): Promise<void> {
    if (!this.context) return
    const session = await this.game.getActiveSession()
    if (!session) {
      console.info("[the-fed] tick skipped", {
        roomId: this.context.roomId,
        reason: "no_session",
        mode: config.mode,
      })
      await this.writeStatus(config, {
        t: Date.now(),
        wealth: 0,
        affordability: 0,
        costScale: config.costScale,
        earnScale: config.earnScale,
        flowRatio: 0,
        acted: false,
        reason: "no_session",
        participantCount: 0,
      })
      return
    }

    const now = Date.now()
    const flow = await this.readFlow()
    const controller = await this.readController()
    const snapshot = await this.game.getEconomySnapshot()
    const economy = resolveEconomy(session.config.economy)
    const basketPrice = await this.resolveBasketPrice(config)
    const elapsedMs =
      flow.lastTickAt != null && flow.lastTickAt < now ? now - flow.lastTickAt : 0

    const sample: EconomySample = {
      balances: snapshot?.balances ?? [],
      basketPrice,
      costScale: economy.costScale,
      earnScale: economy.earnScale,
      elapsedMs,
      netCoinFlow: flow.netCoinFlow,
    }
    const policy = this.policyFromConfig(config)
    const result = nextCostScale(sample, policy, {
      costScale: economy.costScale,
      emaWealth: controller.emaWealth,
    })

    let appliedScale = economy.costScale
    if (config.mode === "adjust" && result.acted) {
      const updated = await this.game.setEconomyScale(
        { costScale: result.costScale },
        `the-fed:${result.reason}`,
      )
      if (updated) appliedScale = updated.costScale
      if (config.announceChanges && appliedScale !== economy.costScale) {
        const pct = Math.round((appliedScale / economy.costScale - 1) * 100)
        if (pct !== 0) {
          const direction = pct > 0 ? "up" : "down"
          await this.context.api.sendSystemMessage(
            this.context.roomId,
            `Prices are ${direction} ${Math.abs(pct)}%.`,
          )
        }
      }
    }

    const acted = config.mode === "adjust" && result.acted
    const reason: TheFedTickReason =
      config.mode === "observe" && result.reason === "adjusted"
        ? "observed"
        : result.reason

    const tick: FedTickRecord = {
      t: now,
      wealth: result.metrics.wealth,
      affordability: result.metrics.affordability,
      costScale: appliedScale,
      earnScale: economy.earnScale,
      flowRatio: result.metrics.flowRatio,
      acted,
      reason,
      participantCount: sample.balances.length,
    }

    console.info("[the-fed] tick", {
      roomId: this.context.roomId,
      sessionId: session.id,
      mode: config.mode,
      minParticipants: config.minParticipants,
      ...tick,
    })

    await this.appendTick(tick)
    await this.writeController({ emaWealth: result.emaWealth, sessionId: session.id })
    await this.writeFlow({ netCoinFlow: 0, lastTickAt: now, sessionId: session.id })
    await this.writeStatus(config, tick)

    await this.emit(
      "TICK",
      {
        wealth: tick.wealth,
        affordability: tick.affordability,
        costScale: tick.costScale,
        earnScale: tick.earnScale,
        flowRatio: tick.flowRatio,
        acted: tick.acted,
        reason: tick.reason,
        participantCount: tick.participantCount,
        mode: config.mode,
      },
      { invalidatesUserState: false },
    )
  }

  private policyFromConfig(config: TheFedConfig): EconomyControllerPolicy {
    return {
      targetAffordability: config.targetAffordability,
      wealthStatistic: config.wealthStatistic,
      smoothing: config.smoothing,
      deadband: config.deadband,
      maxStepPct: config.maxStepPct,
      minCostScale: config.minCostScale,
      maxCostScale: config.maxCostScale,
      minParticipants: config.minParticipants,
    }
  }

  private async resolveBasketPrice(config: TheFedConfig): Promise<number> {
    if (config.basketPriceOverride && config.basketPriceOverride > 0) {
      return config.basketPriceOverride
    }
    const defs = await this.inventory.getAllItemDefinitions()
    const values = defs.map((d) => d.coinValue ?? 0).filter((v) => v > 0)
    return median(values)
  }

  private async nudgeCostScale(
    factor: number,
    reason: string,
  ): Promise<{ success: boolean; message?: string }> {
    const current = await this.game.getEconomyScale()
    const next = clampCostScale(current.costScale * factor)
    const updated = await this.game.setEconomyScale({ costScale: next }, reason)
    if (!updated) return { success: false, message: "No active game session." }
    return { success: true, message: `Cost scale set to ${updated.costScale.toFixed(2)}.` }
  }

  private async resetCostScale(): Promise<{ success: boolean; message?: string }> {
    const updated = await this.game.setEconomyScale({ costScale: 1 }, "the-fed:reset")
    if (!updated) return { success: false, message: "No active game session." }
    return { success: true, message: "Cost scale reset to 1.0." }
  }

  private async exportMetrics(
    initiator?: PluginActionInitiator,
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.context) return { success: false, message: "Plugin not initialized." }
    const ticks = await this.readTicks()
    const body = JSON.stringify(ticks, null, 2)
    const userId = initiator?.userId
    if (userId) {
      await this.context.api.sendUserSystemMessage(
        this.context.roomId,
        userId,
        `The Fed metrics (${ticks.length} ticks):\n${body}`,
      )
    }
    return { success: true, message: `Exported ${ticks.length} ticks.` }
  }

  private async writeStatus(config: TheFedConfig, tick: FedTickRecord): Promise<void> {
    if (!this.context) return
    await this.context.api.setPluginConfig(this.context.roomId, this.name, {
      ...config,
      costScale: roundMetric(tick.costScale),
      earnScale: roundMetric(tick.earnScale),
      affordability: roundMetric(tick.affordability),
      wealth: roundMetric(tick.wealth, 1),
      flowRatio: roundMetric(tick.flowRatio, 3),
      tickReason: tick.reason,
      participantCount: tick.participantCount,
    })
  }

  private async readFlow(): Promise<FedFlowState> {
    const raw = this.context ? await this.context.storage.get(FLOW_KEY) : null
    return parseJson<FedFlowState>(raw, {
      netCoinFlow: 0,
      lastTickAt: null,
      sessionId: null,
    })
  }

  private async writeFlow(state: FedFlowState): Promise<void> {
    if (!this.context) return
    await this.context.storage.set(FLOW_KEY, JSON.stringify(state))
  }

  private async readController(): Promise<FedControllerState> {
    const raw = this.context ? await this.context.storage.get(CONTROLLER_KEY) : null
    return parseJson<FedControllerState>(raw, { emaWealth: null, sessionId: null })
  }

  private async writeController(state: FedControllerState): Promise<void> {
    if (!this.context) return
    await this.context.storage.set(CONTROLLER_KEY, JSON.stringify(state))
  }

  private async readTicks(): Promise<FedTickRecord[]> {
    const raw = this.context ? await this.context.storage.get(TICKS_KEY) : null
    const ticks = parseJson<FedTickRecord[]>(raw, [])
    return Array.isArray(ticks) ? ticks : []
  }

  private async appendTick(tick: FedTickRecord): Promise<void> {
    const ticks = await this.readTicks()
    ticks.push(tick)
    const trimmed = ticks.slice(-MAX_TICKS)
    if (!this.context) return
    await this.context.storage.set(TICKS_KEY, JSON.stringify(trimmed))
  }
}

export function createTheFedPlugin(configOverrides?: Partial<TheFedConfig>): Plugin {
  return new TheFedPlugin(configOverrides)
}

export default createTheFedPlugin
