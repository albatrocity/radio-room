import type {
  InventoryItem,
  ItemDefinition,
  ItemUseResult,
  Plugin,
  PluginActionInitiator,
  PluginComponentSchema,
  PluginConfigSchema,
  PluginContext,
  PluginExportAugmentation,
  PollPresentation,
  PoolCardView,
  RoomExportData,
  SystemEventPayload,
} from "@repo/types"
import {
  BasePlugin,
  collectShares,
  EscrowPoolHelper,
  topContributors,
  type EscrowPoolState,
} from "@repo/plugin-base"
import {
  FUND_PURPOSE_LABELS,
  INCIDENTS,
  isDestination,
  parseTripMap,
  resolveSiteSettings,
  skipPollQuestion,
  triggerableIncidentIdSchema,
  type SkipDefault,
  type TripMap,
  type TripSite,
  type TripStore,
} from "@repo/road-trip-map"
import { ROAD_TRIP_ITEM_DEFINITIONS, routeItemUse } from "./items"
import packageJson from "./package.json"
import { getComponentSchema, getConfigSchema } from "./schema"
import {
  PLUGIN_NAME,
  POLL_CLOSE_BEFORE_EXIT_MS,
  POLL_GIVE_UP_BEFORE_EXIT_MS,
  POLL_MIN_DURATION_MS,
  POLL_RETRY_MS,
  ROAD_TRIP_TAB_ID,
  SKIP_POLL_OPTIONS,
  defaultRoadTripConfig,
  roadTripConfigSchema,
  type RoadTripConfig,
} from "./types"
import { applyTransition, type AppliedTransition } from "./trip/commit"
import { PARKED_AT_START, project, timeToMile } from "./trip/ledger"
import { buildStatusLines, buildTripStore, type TripStatusLines } from "./trip/projection"
import {
  createTripState,
  TRIP_STORAGE_KEYS,
  type FundPayment,
  type SkipVotes,
  type StoredTripMap,
  type TripFund,
  type TripState,
} from "./trip/state"
import { TripStorage } from "./trip/store"
import {
  solveThresholds,
  thresholdId,
  thresholdTarget,
  type ThresholdKind,
  type ThresholdPayload,
} from "./trip/thresholds"
import {
  arriveAtSite,
  deferPoll,
  depart,
  endTrip,
  expireBlocker,
  finishPark,
  formatShare,
  fuelThreshold,
  gameSessionEnded,
  gameSessionStarted,
  gasUrgency,
  liveSkipDefault,
  markPolling,
  pauseTrip,
  extendFundHold,
  recordLevy,
  resolveFund,
  startLevy,
  resolveSkip,
  resumeTrip,
  revealSite,
  setFundsMode,
  type FundOutcome,
  type SignVariant,
  type Transition,
  type TripEffect,
} from "./trip/transitions"
import {
  advanceIncident,
  fireScripted,
  installPart,
  skipIncidentStep,
  triggerIncident,
  useIncidentItem,
} from "./trip/incidents"
import { LEVY_RETRY_MS, LEVY_STALE_MS } from "./trip/helpers"
import { formatTripTimelineMarkdown } from "./export/formatTripTimelineMarkdown"

export type { RoadTripConfig } from "./types"
export {
  roadTripConfigSchema,
  defaultRoadTripConfig,
  PLUGIN_NAME as ROAD_TRIP_PLUGIN_NAME,
} from "./types"

type ActionResult = { success: boolean; message?: string }

type SchedulePayload = ThresholdPayload

const EMPTY_STATUS: TripStatusLines = {
  tripProgress: "No map loaded",
  tripEta: "—",
  tripNextSite: "—",
  tripFuel: "—",
  tripWarnings: "None",
}

const EMPTY_PAYLOAD = { tripActive: false, trip: null, tripPool: null, tripPoolOpen: false }

/** Thrown inside the CAS when there is no trip (or its map changed); aborts the write. */
class NoTripError extends Error {}

/** A schedule armed this close to now is re-sent even if unchanged, in case it already fired. */
const REARM_SLACK_MS = 2_000

/** Backstop for the cached `costScale` when an economy change happened in another process. */
const COST_SCALE_TTL_MS = 30_000

/** Settle passes before giving up on a state that keeps changing underneath. */
const MAX_SETTLE_PASSES = 3

/**
 * Road Trip (ADR 0200): a van drives a Trip Map's route in real time. Progress
 * is a ledger of legs; every change goes through `mutateTrip`, which re-solves
 * and re-arms durable schedules. Nothing ticks.
 */
export class RoadTripPlugin extends BasePlugin<RoadTripConfig> {
  name = PLUGIN_NAME
  version = packageJson.version
  description = "Road Trip — drive a Trip Map in real time, vote at exits, and stop at sites."

  static readonly configSchema = roadTripConfigSchema as any
  static readonly defaultConfig = defaultRoadTripConfig

  /** Trip mode is "a map is loaded", independent of `enabled` (D2). */
  readonly schedulesIgnoreEnabled = true

  /** Parsed map keyed by content hash; `TripState.map.hash` says which one is current. */
  private mapCache: StoredTripMap | null = null

  /** Serializes settle passes in this process (cross-process races fall to the version check). */
  private settleChain: Promise<void> = Promise.resolve()

  /** Bumped by every committed mutation, so threshold handlers know whether they changed anything. */
  private mutationCount = 0

  private costScaleCache: { value: number; at: number } | null = null

  private get trips(): TripStorage {
    if (!this.context) throw new Error("[road-trip] context not initialised")
    return new TripStorage(this.context.storage)
  }

  /** Voluntary-mode escrow (ADR 0204). Only a host-waived incident fund refunds it. */
  private get tripPool(): EscrowPoolHelper {
    if (!this.context) throw new Error("[road-trip] context not initialised")
    return new EscrowPoolHelper(
      { storage: this.context.storage, game: this.game },
      { key: TRIP_STORAGE_KEYS.POOL, reason: "road-trip:fund" },
    )
  }

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)
    context.inventory.registerItemDefinitions(ROAD_TRIP_ITEM_DEFINITIONS)
    const kinds: ThresholdKind[] = [
      "reveal",
      "skip-poll",
      "arrive",
      "expire",
      "fuel",
      "incident",
      "scripted",
    ]
    for (const kind of kinds) {
      this.onScheduled(kind, async (payload) =>
        this.handleThreshold(kind, payload as SchedulePayload),
      )
    }
    this.on("POLL_CLOSED", (data) => this.handlePollClosed(data))
    this.on("GAME_ECONOMY_SCALE_CHANGED", (data) => {
      if (data.roomId === context.roomId) this.costScaleCache = { value: data.costScale, at: Date.now() }
    })
    this.on("GAME_SESSION_ENDED", async () => {
      this.costScaleCache = null
      // An open pool closes and counts as short (M1 Status, D18).
      await this.settleOpenFund()
      await this.mutateTrip(gameSessionEnded)
    })
    this.on("GAME_SESSION_STARTED", async () => {
      this.costScaleCache = null
      await this.mutateTrip(gameSessionStarted)
    })
  }

  async getComponentState(): Promise<Record<string, unknown>> {
    if (!this.context) return { ...EMPTY_PAYLOAD, ...EMPTY_STATUS }
    return this.buildPayload(await this.trips.readState(), Date.now())
  }

  /** The loaded map for `state`, parsed once per hash instead of on every read. */
  private async mapFor(state: TripState | null): Promise<StoredTripMap | null> {
    if (!state) return null
    if (this.mapCache?.hash === state.map.hash) return this.mapCache
    const stored = await this.trips.readMap()
    this.mapCache = stored
    return stored
  }

  // ---------------------------------------------------------------------------
  // mutateTrip: the one write path
  // ---------------------------------------------------------------------------

  /**
   * Read → pure transition and leg commit inside one CAS → append leg history +
   * log → run effects once → settle (re-arm thresholds, publish). Returns null
   * when the transition was a no-op.
   */
  private async mutateTrip(transition: Transition): Promise<TripState | null> {
    if (!this.context) return null
    const stored = await this.mapFor(await this.trips.readState())
    if (!stored) return null
    const costScale = await this.costScale()
    const now = Date.now()
    let applied: AppliedTransition | null = null
    try {
      await this.trips.updateState((prev) => {
        applied = null
        if (!prev || prev.map.hash !== stored.hash) throw new NoTripError()
        applied = applyTransition(prev, transition, stored.map, now, costScale)
        return applied ? applied.next : prev
      })
    } catch (error) {
      if (error instanceof NoTripError) return null
      throw error
    }
    const result = applied as AppliedTransition | null
    if (!result) return null
    this.mutationCount++

    if (result.appended) await this.trips.appendLeg(result.appended)
    for (const entry of result.log) await this.trips.appendLog(entry)
    await this.runEffects(result.effects, stored.map, result.next)
    await this.settle()
    return result.next
  }

  /**
   * Re-arm thresholds and publish from the latest state, never from the state
   * a caller happened to hold, so a slow mutation can't cancel a newer one's
   * schedules or publish over it. Serialized per process; across processes a
   * pass repeats while the state version moves underneath it.
   */
  private settle(publish = true): Promise<void> {
    const run = this.settleChain.then(() => this.settlePasses(publish))
    this.settleChain = run.catch(() => {})
    return run
  }

  private async settlePasses(publish: boolean): Promise<void> {
    for (let pass = 0; pass < MAX_SETTLE_PASSES; pass++) {
      const state = await this.trips.readState()
      const stored = await this.mapFor(state)
      if (!state || !stored) return
      const now = Date.now()
      await this.armThresholds(state, stored.map, now)
      const latest = await this.trips.readState()
      if (latest?.version === state.version && latest.tripId === state.tripId) {
        if (publish) await this.publish(state, now)
        return
      }
    }
    console.warn(`[road-trip] settle didn't converge in ${this.context?.roomId}; next change re-arms`)
  }

  /** Arm solved thresholds, skipping unchanged future ones; cancel ones no longer wanted. */
  private async armThresholds(state: TripState, map: TripMap, now: number): Promise<void> {
    const requests = solveThresholds(state, map, state.leg ?? PARKED_AT_START, now)
    const prev = await this.trips.readArmed()
    const next: Record<string, number> = {}
    for (const request of requests) {
      next[request.id] = request.at
      if (prev[request.id] === request.at && request.at > now + REARM_SLACK_MS) continue
      await this.schedule({
        id: request.id,
        kind: request.kind,
        at: request.at,
        payload: request.payload,
      })
    }
    for (const id of Object.keys(prev)) {
      if (!(id in next)) await this.cancelSchedule(id)
    }
    await this.trips.writeArmed(next)
  }

  private async cancelArmed(): Promise<void> {
    for (const id of Object.keys(await this.trips.readArmed())) await this.cancelSchedule(id)
    await this.trips.writeArmed({})
  }

  // ---------------------------------------------------------------------------
  // Effects (run once, after the CAS)
  // ---------------------------------------------------------------------------

  private async runEffects(effects: TripEffect[], map: TripMap, state: TripState): Promise<void> {
    if (!this.context) return
    const { api, roomId } = this.context
    for (const effect of effects) {
      try {
        switch (effect.type) {
          case "sign":
            await this.tripAnnounce(effect.variant, effect.title, effect.body, effect.icon)
            break
          case "open-shop":
            await this.openSiteShop(map, effect.siteId, effect.scopeId)
            break
          case "close-shop":
            await api.requestCapability(roomId, "shopAccess", "closeRoomShop", effect.scopeId)
            break
          case "close-poll": {
            const creator = await this.roomCreator()
            if (creator)
              await api.closePoll({
                roomId,
                userId: creator,
                pollId: effect.pollId,
                announce: false,
              })
            break
          }
          case "nudge-host":
            await this.nudgeHost(map, state)
            break
          case "open-fund":
            await this.openFund(effect.fund, effect.title, state.tripId)
            break
          case "close-pool":
            await this.tripPool.close("trip-ended", { poolId: effect.fundId })
            break
          case "nudge-holders":
            await this.nudgeHolders(effect.itemIds, effect.message)
            break
        }
      } catch (error) {
        console.error(`[road-trip] effect ${effect.type} failed in ${roomId}:`, error)
      }
    }
  }

  /** Every trip message goes through here so they all render as road signs (D25). */
  private async tripAnnounce(
    variant: SignVariant,
    title: string,
    body?: string,
    icon?: string,
  ): Promise<void> {
    if (!this.context) return
    await this.context.api.sendSystemMessage(this.context.roomId, body ?? title, {
      type: "alert",
      status: variant,
      title,
      theme: "road-trip",
      ...(icon ? { icon } : {}),
    })
  }

  // ---------------------------------------------------------------------------
  // Funds (ADR 0204): automatic levy or voluntary pool, settled into resolveFund
  // ---------------------------------------------------------------------------

  /** Runs once, after the CAS that opened the fund step. */
  private async openFund(fund: TripFund, title: string, tripId: string): Promise<void> {
    if (!this.context) return
    if (fund.mode === "voluntary") {
      const opened = await this.tripPool.open({
        id: fund.id,
        title,
        goal: fund.cost,
        closesAt: fund.endsAt,
      })
      if (!opened.ok) console.warn(`[road-trip] ${fund.purpose} pool didn't open: ${opened.message}`)
      return
    }
    const { api, roomId } = this.context
    // Claim the fund before any coin moves. If it was settled or waived first, charge nobody.
    if (!(await this.mutateTrip(this.forTrip(tripId, startLevy(fund.id))))) return
    const payers = await api.getOnlineUserIds(roomId)
    const result = await collectShares(this.game, {
      cost: fund.cost,
      reason: `road-trip:${fund.purpose}`,
      payers,
    })
    const names = await this.usernames(result.perUser.map((p) => p.userId))
    const paid: FundPayment[] = result.perUser.map((p) => ({
      ...p,
      name: names.get(p.userId) ?? "Someone",
    }))
    const rate = formatShare(result.rate)
    const label = FUND_PURPOSE_LABELS[fund.purpose]
    await Promise.all(
      paid.map((payment) =>
        api.sendUserSystemMessage(
          roomId,
          payment.userId,
          `${label} took ${rate} of everyone's wallet. Your share: ${payment.amount} coin${payment.amount === 1 ? "" : "s"}.`,
          {
            type: "alert",
            status: "info",
            title: "Road Trip",
            theme: "road-trip",
            icon: fund.purpose === "gas" ? "⛽" : "🧾",
          },
        ),
      ),
    )
    await this.mutateTrip(
      this.forTrip(
        tripId,
        recordLevy(fund.id, {
          collected: result.collected,
          payers: paid.length,
          rate: result.rate,
          paid,
        }),
      ),
    )
  }

  /**
   * Settle the open fund step: close the pool (voluntary) or use the recorded
   * levy (automatic), then fill up. Safe to call twice: `close` settles once
   * and `resolveFund` is idempotent on the fund id.
   */
  private async settleOpenFund(fundId?: string): Promise<boolean> {
    const state = await this.trips.readState()
    const fund = state?.fund
    if (!state || !fund || (fundId !== undefined && fund.id !== fundId)) return false
    let outcome: FundOutcome
    if (fund.mode === "voluntary") {
      const closed = await this.tripPool.close("settled", { poolId: fund.id })
      // Already closed: a retry of our own settle uses the record; a host waive owns a refund.
      const pool = closed?.pool ?? (await this.tripPool.read())
      if (!closed && pool?.id === fund.id && pool.closedReason === "refund") return false
      outcome = poolOutcome(pool?.id === fund.id ? pool : null)
    } else if (fund.levyStartedAt !== undefined && fund.collected === undefined) {
      // The levy is still debiting (or recording). Never settle it as "0 collected".
      if (Date.now() - fund.levyStartedAt < LEVY_STALE_MS) {
        await this.mutateTrip(
          this.forTrip(state.tripId, extendFundHold(fund.id, Date.now() + LEVY_RETRY_MS)),
        )
        return false
      }
      console.error(
        `[road-trip] levy for ${fund.id} never recorded in ${this.context?.roomId}; settling without it`,
      )
      outcome = { collected: 0, payers: 0, abandonLevy: true }
    } else {
      outcome = {
        collected: fund.collected ?? 0,
        payers: fund.payers ?? 0,
        ...(fund.paid ? { paid: fund.paid } : {}),
      }
    }
    const saved = await this.mutateTrip(this.forTrip(state.tripId, resolveFund(fund.id, outcome)))
    return saved !== null
  }

  /** Anyone in the room can chip in while a voluntary gas pool is open (D17). */
  private async chipIn(
    initiator: PluginActionInitiator | undefined,
    params: Record<string, unknown> | undefined,
  ): Promise<ActionResult> {
    const userId = initiator?.userId
    if (!userId) return { success: false, message: "Sign in to chip in." }
    const state = await this.trips.readState()
    const fund = state?.fund
    if (!state || !fund || fund.mode !== "voluntary") {
      return { success: false, message: "There's nothing to chip in for right now." }
    }
    const amount = Number(params?.amount)
    const result = await this.tripPool.pledge(userId, amount, {
      poolId: fund.id,
      ...(initiator?.username ? { username: initiator.username } : {}),
    })
    if (!result.ok) return { success: false, message: result.message }
    if (result.goalMet) await this.settleOpenFund(fund.id)
    else await this.settle()
    return {
      success: true,
      message: result.goalMet
        ? fund.purpose === "gas"
          ? "That covers it. Filling up!"
          : "That covers it!"
        : `Thanks! ${result.pool.raised} / ${result.pool.goal} coins.`,
    }
  }

  /**
   * Host waives the open incident fund (Quick Access "Skip incident step"):
   * pledges or levy shares go back, then the incident moves on as if paid.
   * Refused while an automatic levy is still being collected.
   */
  private async waiveIncidentFund(state: TripState, fund: TripFund): Promise<ActionResult> {
    if (fund.mode === "automatic" && fund.levyStartedAt !== undefined && fund.collected === undefined) {
      return { success: false, message: "Still collecting. Try again in a moment." }
    }
    if (fund.mode === "voluntary") {
      // Claim the pool first: if its deadline already settled it, the coins were spent.
      const refund = await this.tripPool.refundAll({ poolId: fund.id })
      if (!refund.claimed) {
        return { success: false, message: "Too late: that fund was already settled." }
      }
    } else {
      for (const payment of fund.paid ?? []) {
        if (payment.amount > 0) {
          await this.game.addScore(payment.userId, "coin", payment.amount, `road-trip:${fund.purpose}:refund`, {
            intent: "exact",
          })
        }
      }
    }
    const saved = await this.mutateTrip(
      this.forTrip(state.tripId, resolveFund(fund.id, { collected: 0, payers: 0, waived: true })),
    )
    return saved
      ? { success: true, message: `${FUND_PURPOSE_LABELS[fund.purpose]} waived and refunded.` }
      : { success: false, message: "Couldn't waive it." }
  }

  private async skipIncidentStepAction(): Promise<ActionResult> {
    const state = await this.trips.readState()
    const incident = state?.incident
    const step = incident?.steps[incident.step]
    if (!state || !incident || !step) return { success: false, message: "No incident in progress." }
    if (step.kind === "tow") return { success: false, message: "The tow can't be skipped." }
    if (step.kind === "fund") {
      const fund = state.fund
      if (!fund || fund.incidentId !== incident.id) {
        return { success: false, message: "No incident fund is open." }
      }
      return this.waiveIncidentFund(state, fund)
    }
    const saved = await this.mutateTrip(skipIncidentStep)
    return saved
      ? { success: true, message: `Skipped: ${step.label}.` }
      : { success: false, message: "Couldn't skip that step." }
  }

  private async triggerIncidentAction(raw: unknown): Promise<ActionResult> {
    const parsed = triggerableIncidentIdSchema.safeParse(raw)
    if (!parsed.success) return { success: false, message: "Pick an incident." }
    const state = await this.trips.readState()
    if (state?.status !== "driving") return { success: false, message: "The van isn't driving." }
    const before = state.incidentQueue.length
    const saved = await this.mutateTrip(triggerIncident(parsed.data))
    if (!saved) return { success: false, message: "Couldn't trigger it." }
    const name = INCIDENTS[parsed.data].name
    return saved.incidentQueue.length > before
      ? { success: true, message: `${name} queued: it starts once the van's moving again.` }
      : { success: true, message: `${name}!` }
  }

  /** DM every online traveler holding one of `itemIds` (Blown Tire: "you have a Fix-a-Flat"). */
  private async nudgeHolders(itemIds: string[], message: string): Promise<void> {
    if (!this.context) return
    const { api, inventory, roomId } = this.context
    const wanted = new Set(itemIds)
    // One inventory read per traveler, all travelers at once.
    await Promise.all(
      (await api.getOnlineUserIds(roomId)).map(async (userId) => {
        const { items } = await inventory.getInventory(userId)
        if (!items.some((item) => item.quantity > 0 && wanted.has(item.definitionId))) return
        await api.sendUserSystemMessage(roomId, userId, message, {
          type: "alert",
          status: "warning",
          title: "Road Trip",
          theme: "road-trip",
          icon: "🧰",
        })
      }),
    )
  }

  /** Parts install on the van; consumables end the incident they fix. Kept on refusal. */
  async onItemUsed(
    userId: string,
    _item: InventoryItem,
    definition: ItemDefinition,
  ): Promise<ItemUseResult> {
    const state = await this.trips.readState()
    const route = routeItemUse(state, definition.shortId)
    if (route.kind === "refused" || !state) {
      return {
        success: false,
        consumed: false,
        message: route.kind === "refused" ? route.message : "There's no trip right now.",
      }
    }
    const name = (await this.usernames([userId])).get(userId) ?? "Someone"
    const traveler = { userId, name }
    const saved = await this.mutateTrip(
      this.forTrip(
        state.tripId,
        route.kind === "install"
          ? installPart(route.partId, traveler)
          : useIncidentItem(route.shortId, traveler),
      ),
    )
    if (!saved) {
      return { success: false, consumed: false, message: "Too late: nothing to use it on now." }
    }
    return {
      success: true,
      consumed: true,
      message: route.kind === "install" ? `${definition.name} installed.` : `${definition.name} used.`,
    }
  }

  private async usernames(userIds: string[]): Promise<Map<string, string>> {
    if (!this.context || userIds.length === 0) return new Map()
    const users = await this.context.api.getUsersByIds(userIds)
    return new Map(users.map((u) => [u.userId, u.username ?? "Someone"]))
  }

  /**
   * Session `costScale`, cached per instance: set by `GAME_ECONOMY_SCALE_CHANGED`,
   * cleared when a session starts or ends, and re-read after `COST_SCALE_TTL_MS`
   * in case another process changed it. Fund quotes lock at open (D15), so a few
   * seconds of staleness only affects display.
   */
  private async costScale(): Promise<number> {
    const cached = this.costScaleCache
    if (cached && Date.now() - cached.at < COST_SCALE_TTL_MS) return cached.value
    let value = 1
    try {
      // No session resolves to the default economy (costScale 1).
      value = (await this.game.getEconomyScale()).costScale
    } catch {
      value = 1
    }
    this.costScaleCache = { value, at: Date.now() }
    return value
  }

  private async openSiteShop(map: TripMap, siteId: string, scopeId: string): Promise<void> {
    await this.trips.writeShopWarning(await this.siteShopProblem(map, siteId, scopeId))
  }

  /** Opens the site's shop; returns a Quick Access warning when it couldn't. */
  private async siteShopProblem(
    map: TripMap,
    siteId: string,
    scopeId: string,
  ): Promise<string | null> {
    if (!this.context) return null
    const site = map.sites.find((s) => s.id === siteId)
    const shopIds = site?.shop?.shopIds ?? []
    const offers = site?.shop?.offers ?? []
    if (!site || (shopIds.length === 0 && offers.length === 0)) return null
    const result = await this.context.api.requestCapability(
      this.context.roomId,
      "shopAccess",
      "openRoomShop",
      {
        scopeId,
        shopIds,
        ...(offers.length > 0 ? { offers } : {}),
        ...(site.shop?.title ? { title: site.shop.title } : {}),
        ...(site.shop?.openingMessage ? { openingMessage: site.shop.openingMessage } : {}),
      },
    )
    if (result.ok && result.value.ok) return null
    const reason = result.ok ? (result.value.ok ? "" : result.value.reason) : result.reason
    return reason === "disabled"
        ? `Item Shops is disabled, so ${site.name}'s shop didn't open`
        : reason === "no-session"
          ? `No game session, so ${site.name}'s shop didn't open`
          : reason === "unavailable"
            ? `${site.name}'s shop isn't available in this room, so it didn't open`
            : `${site.name}'s shop didn't open (${reason})`
  }

  private async nudgeHost(map: TripMap, state: TripState): Promise<void> {
    if (!this.context) return
    const creator = await this.roomCreator()
    const destination = map.sites.find(isDestination)
    if (!creator || !destination) return
    await this.context.api.sendUserSystemMessage(
      this.context.roomId,
      creator,
      `Arrived at ${destination.name}${state.status === "late" ? " (late)" : ""}. Activate the next segment when you're ready.`,
      {
        type: "alert",
        status: "info",
        title: "Road Trip",
        theme: "road-trip",
        icon: destination.icon,
      },
    )
  }

  private async roomCreator(): Promise<string | null> {
    const room = await this.context?.getRoom()
    return room?.creator ?? null
  }

  // ---------------------------------------------------------------------------
  // Publishing (one store update per mutation)
  // ---------------------------------------------------------------------------

  private async buildPayload(
    state: TripState | null,
    now: number,
  ): Promise<Record<string, unknown>> {
    const stored = await this.mapFor(state)
    if (!state || !stored) return { ...EMPTY_PAYLOAD, ...EMPTY_STATUS }
    const fund = state.fund
    const pool =
      fund?.mode === "voluntary" && state.status === "driving" ? await this.tripPool.read() : null
    const livePool = pool && fund && pool.id === fund.id ? pool : null
    const store: TripStore = buildTripStore(state, stored.map, state.leg ?? PARKED_AT_START, now, {
      costScale: await this.costScale(),
      ...(livePool ? { poolRaised: livePool.raised } : {}),
    })
    const shopWarning = state.status === "driving" ? await this.trips.readShopWarning() : null
    const tripPool = livePool && fund ? poolCardView(livePool, fund, stored.map) : null
    return {
      tripActive: true,
      trip: store,
      tripPool,
      tripPoolOpen: tripPool?.open === true,
      ...buildStatusLines(
        state,
        stored.map,
        store,
        this.extraWarnings(state, stored.map, shopWarning),
      ),
    }
  }

  private extraWarnings(state: TripState, map: TripMap, shopWarning: string | null): string[] {
    const warnings: string[] = []
    if (shopWarning) warnings.push(shopWarning)
    if (state.status === "arrived" || state.status === "late") {
      const destination = map.sites.find(isDestination)
      warnings.push(
        `Arrived${destination ? ` at ${destination.name}` : ""}: activate the next segment`,
      )
    }
    return warnings
  }

  private async publish(state: TripState | null, now: number): Promise<void> {
    await this.emit("TRIP_UPDATED", await this.buildPayload(state, now), {
      invalidatesUserState: false,
    })
  }

  // ---------------------------------------------------------------------------
  // Durable thresholds (idempotent: re-check state, never trust the payload)
  // ---------------------------------------------------------------------------

  private forTrip(tripId: string, transition: Transition): Transition {
    return (state, ctx) => (state.tripId === tripId ? transition(state, ctx) : null)
  }

  /**
   * A fired schedule is consumed: forget it, handle it, and if the handler
   * changed nothing, settle anyway so a still-wanted threshold is re-armed
   * (e.g. an arrival that fired while the van was parked elsewhere).
   */
  private async handleThreshold(kind: ThresholdKind, payload: SchedulePayload): Promise<void> {
    if (!payload?.tripId) return
    const target = thresholdTarget(payload)
    if (target) await this.trips.forgetArmed(thresholdId(kind, target))
    const before = this.mutationCount
    await this.runThreshold(kind, payload)
    if (this.mutationCount === before) await this.settle(false)
  }

  private async runThreshold(kind: ThresholdKind, payload: ThresholdPayload): Promise<void> {
    const { tripId, siteId, blockerId, level, incidentId, step, eventId } = payload
    switch (kind) {
      case "incident":
        if (incidentId && step !== undefined)
          await this.mutateTrip(this.forTrip(tripId, advanceIncident(incidentId, step)))
        return
      case "scripted":
        if (eventId) await this.mutateTrip(this.forTrip(tripId, fireScripted(eventId)))
        return
      case "reveal":
        if (siteId) await this.mutateTrip(this.forTrip(tripId, revealSite(siteId)))
        return
      case "fuel":
        if (level) await this.mutateTrip(this.forTrip(tripId, fuelThreshold(level)))
        return
      case "expire":
        if (blockerId) await this.handleExpire(tripId, blockerId)
        return
      case "arrive":
        if (siteId) await this.handleArrive(tripId, siteId)
        return
      case "skip-poll":
        if (siteId) await this.handleSkipPoll(tripId, siteId)
        return
    }
  }

  /** Fund holds settle with coin I/O; every other blocker expires purely. */
  private async handleExpire(tripId: string, blockerId: string): Promise<void> {
    const state = await this.trips.readState()
    if (state?.tripId !== tripId) return
    const blocker = state.blockers.find((b) => b.id === blockerId)
    if (blocker?.kind === "fund") {
      if (state.fund && blocker.until !== undefined && blocker.until <= Date.now()) {
        await this.settleOpenFund(state.fund.id)
      }
      return
    }
    await this.mutateTrip(this.forTrip(tripId, expireBlocker(blockerId)))
  }

  private async handleArrive(tripId: string, siteId: string): Promise<void> {
    const state = await this.trips.readState()
    const runtime = state?.tripId === tripId ? state.sites[siteId] : undefined
    let votes: SkipVotes | undefined
    if (runtime?.phase === "polling" && runtime.pollId && runtime.pollOptionIds) {
      const tally = await this.context!.api.tallyPoll(runtime.pollId)
      votes = {
        stop: tally[runtime.pollOptionIds[0]] ?? 0,
        skip: tally[runtime.pollOptionIds[1]] ?? 0,
      }
    }
    await this.mutateTrip(this.forTrip(tripId, arriveAtSite(siteId, votes ? { votes } : {})))
  }

  /** Open a site's skip poll, deferring around other polls until 15s before the exit (M1). */
  private async handleSkipPoll(tripId: string, siteId: string): Promise<void> {
    if (!this.context) return
    const state = await this.trips.readState()
    const stored = await this.mapFor(state)
    const leg = state?.leg
    if (!state || !stored || !leg || state.tripId !== tripId || state.status !== "driving") return
    if (state.sites[siteId]?.phase !== "ahead" || leg.mph <= 0) return
    const site = stored.map.sites.find((s) => s.id === siteId)
    if (!site) return
    const arriveAt = timeToMile(leg, site.mile)
    if (arriveAt === null) return

    const now = Date.now()
    const applyDefault = () => this.mutateTrip(this.forTrip(tripId, resolveSkip(siteId)))
    const settings = resolveSiteSettings(stored.map, site)
    const closesAt = Math.min(now + settings.pollDurationMs, arriveAt - POLL_CLOSE_BEFORE_EXIT_MS)
    if (arriveAt - now < POLL_GIVE_UP_BEFORE_EXIT_MS || closesAt - now < POLL_MIN_DURATION_MS) {
      await applyDefault()
      return
    }

    const creator = await this.roomCreator()
    if (!creator) {
      await applyDefault()
      return
    }
    const projected = project(leg, now)
    const milesAway = site.mile - projected.mile
    const fuelCtx = { mile: projected.mile, gallonsUsed: projected.gallonsUsed }
    const urgency = gasUrgency(state, stored.map, site, fuelCtx)
    const question = skipPollQuestion(site, milesAway, settings.mystery)
    const created = await this.context.api.createPoll({
      roomId: this.context.roomId,
      userId: creator,
      question: urgency ? `${urgency}. ${question}` : question,
      options: SKIP_POLL_OPTIONS.map((o) => ({ label: o.label })),
      closesAt,
      announce: false,
      presentation: skipPollPresentation(
        site,
        settings.mystery,
        liveSkipDefault(state, stored.map, site, fuelCtx),
        urgency,
      ),
    })
    if (!created.ok) {
      const retryAt = now + POLL_RETRY_MS
      if (created.error.status === 409 && retryAt < arriveAt - POLL_GIVE_UP_BEFORE_EXIT_MS) {
        await this.mutateTrip(this.forTrip(tripId, deferPoll(siteId, retryAt)))
      } else {
        await applyDefault()
      }
      return
    }
    const [stopOption, skipOption] = created.poll.options
    const marked =
      stopOption && skipOption
        ? await this.mutateTrip(
            this.forTrip(
              tripId,
              markPolling(siteId, created.poll.id, [stopOption.id, skipOption.id]),
            ),
          )
        : null
    if (!marked) {
      await this.context.api.closePoll({
        roomId: this.context.roomId,
        userId: creator,
        pollId: created.poll.id,
        announce: false,
      })
    }
  }

  private async handlePollClosed(data: SystemEventPayload<"POLL_CLOSED">): Promise<void> {
    if (!this.context || data.roomId !== this.context.roomId) return
    const state = await this.trips.readState()
    if (!state) return
    const entry = Object.entries(state.sites).find(([, runtime]) => runtime.pollId === data.poll.id)
    if (!entry) return
    const [siteId, runtime] = entry
    const [stopId, skipId] = runtime.pollOptionIds ?? [
      data.poll.options[0]?.id,
      data.poll.options[1]?.id,
    ]
    const tallies = data.results.optionTallies
    const votes: SkipVotes = {
      stop: (stopId && tallies[stopId]) || 0,
      skip: (skipId && tallies[skipId]) || 0,
    }
    await this.mutateTrip(
      this.forTrip(state.tripId, resolveSkip(siteId, { pollId: data.poll.id, votes })),
    )
  }

  // ---------------------------------------------------------------------------
  // Admin actions (Quick Access + plugin settings)
  // ---------------------------------------------------------------------------

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
    params?: Record<string, unknown>,
  ): Promise<ActionResult> {
    if (!this.context) return { success: false, message: "Plugin not initialized" }
    if (action === "chipIn") return this.chipIn(initiator, params)
    const admin = await this.requireRoomAdminForAction(initiator)
    if (!admin.ok) return admin.result
    switch (action) {
      case "loadMap":
        return this.loadMap(params?.mapJson, initiator?.userId)
      case "unloadMap":
        return this.unloadMap()
      case "depart":
        return this.departAction()
      case "pause":
        return this.simpleAction(pauseTrip, "Trip paused.", "The van isn't driving.")
      case "resume":
        return this.simpleAction(
          resumeTrip,
          "Back on the road.",
          "The trip isn't paused by the host.",
        )
      case "leaveNow":
        return this.leaveNow()
      case "endTrip":
        await this.settleOpenFund()
        return this.simpleAction(endTrip, "Trip ended.", "There's no trip in progress.")
      case "switchFundsMode":
        return this.switchFundsMode()
      case "triggerIncident":
        return this.triggerIncidentAction(params?.incident)
      case "skipIncidentStep":
        return this.skipIncidentStepAction()
      case "newTrip":
        return this.newTrip()
      default:
        return super.executeAction(action, initiator, params)
    }
  }

  /** End the stop early, settling a gas fund that's still holding the van. */
  private async leaveNow(): Promise<ActionResult> {
    const settledFund = await this.settleOpenFund()
    const left = await this.mutateTrip(finishPark())
    return left || settledFund
      ? { success: true, message: "Leaving now." }
      : { success: false, message: "The van isn't parked at a site." }
  }

  private async switchFundsMode(): Promise<ActionResult> {
    const state = await this.trips.readState()
    if (!state) return { success: false, message: "Load a map first." }
    if (state.status !== "loaded") {
      return { success: false, message: "Funds mode can only change before departure." }
    }
    const mode = state.fundsMode === "automatic" ? "voluntary" : "automatic"
    const saved = await this.mutateTrip(setFundsMode(mode))
    if (!saved) return { success: false, message: "Couldn't switch funds mode." }
    return {
      success: true,
      message:
        mode === "automatic"
          ? "Funds: automatic. Costs are split by wealth."
          : "Funds: voluntary. Gas stops open a pool to chip in.",
    }
  }

  private async simpleAction(
    transition: Transition,
    ok: string,
    noop: string,
  ): Promise<ActionResult> {
    const saved = await this.mutateTrip(transition)
    return saved ? { success: true, message: ok } : { success: false, message: noop }
  }

  private async loadMap(raw: unknown, userId?: string): Promise<ActionResult> {
    if (typeof raw !== "string" || raw.trim() === "") {
      return { success: false, message: "Paste a Trip Map JSON." }
    }
    const state = await this.trips.readState()
    if (state && state.status !== "loaded") {
      return {
        success: false,
        message: "The map is locked once the van departs. Use New trip or Unload map first.",
      }
    }
    const parsed = parseTripMap(raw)
    if (!parsed.ok) {
      const errors = parsed.issues.filter((i) => i.severity === "error").map((i) => i.message)
      return { success: false, message: `Map not loaded: ${errors.slice(0, 3).join(" · ")}` }
    }
    const shopIssues = await this.validateSiteShops(parsed.map)
    if (shopIssues.errors.length > 0) {
      return {
        success: false,
        message: `Map not loaded: ${shopIssues.errors.slice(0, 3).join(" · ")}`,
      }
    }

    await this.cancelArmed()
    await this.trips.clearRun()
    const stored: StoredTripMap = {
      map: parsed.map,
      hash: parsed.hash,
      loadedAt: Date.now(),
      ...(userId ? { loadedBy: userId } : {}),
    }
    await this.trips.writeMap(stored)
    this.mapCache = stored
    const fresh = createTripState(
      stored,
      newTripId(),
      parsed.map.tuning.seed ?? Math.floor(Math.random() * 2 ** 31),
    )
    await this.trips.writeState(fresh)
    await this.publish(fresh, Date.now())

    const warnings = [
      ...parsed.issues.filter((i) => i.severity === "warning").map((i) => i.message),
      ...shopIssues.warnings,
    ]
    const summary = `Loaded "${parsed.map.title}": ${fresh.routeMiles.toFixed(1)} mi, ${parsed.map.sites.length} sites.`
    return {
      success: true,
      message:
        warnings.length > 0 ? `${summary} Warnings: ${warnings.slice(0, 3).join(" · ")}` : summary,
    }
  }

  private async validateSiteShops(map: TripMap): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = []
    const warnings: string[] = []
    for (const site of map.sites) {
      const shopIds = site.shop?.shopIds ?? []
      const offers = site.shop?.offers ?? []
      if (shopIds.length === 0 && offers.length === 0) continue
      const result = await this.context!.api.requestCapability(
        this.context!.roomId,
        "shopAccess",
        "validateShop",
        { shopIds, ...(offers.length > 0 ? { offers } : {}) },
      )
      if (!result.ok) {
        warnings.push(`Item Shops isn't available, so ${site.name}'s shop won't open`)
        continue
      }
      if (!result.value.ok) errors.push(...result.value.errors.map((e) => `${site.name}: ${e}`))
      else warnings.push(...(result.value.warnings ?? []).map((w) => `${site.name}: ${w}`))
    }
    return { errors, warnings }
  }

  private async unloadMap(): Promise<ActionResult> {
    const state = await this.trips.readState()
    if (!state && !(await this.trips.readMap()))
      return { success: false, message: "No map is loaded." }
    if (state?.status === "driving")
      return { success: false, message: "End the trip before unloading the map." }
    await this.cancelArmed()
    await this.trips.clearAll()
    this.mapCache = null
    await this.publish(null, Date.now())
    return { success: true, message: "Map unloaded." }
  }

  private async departAction(): Promise<ActionResult> {
    const state = await this.trips.readState()
    if (!state) return { success: false, message: "Load a map first." }
    if (state.status !== "loaded")
      return { success: false, message: "The van already left. Use New trip to start over." }
    if (!(await this.game.getActiveSession())) {
      return { success: false, message: "Start a game session before the van can leave." }
    }
    const saved = await this.mutateTrip(depart)
    return saved
      ? { success: true, message: "The van is on the road." }
      : { success: false, message: "Couldn't depart." }
  }

  private async newTrip(): Promise<ActionResult> {
    const state = await this.trips.readState()
    const stored = state ? await this.mapFor(state) : await this.trips.readMap()
    if (!stored) return { success: false, message: "Load a map first." }
    if (state?.status === "driving") return { success: false, message: "End the trip first." }
    await this.cancelArmed()
    await this.trips.clearRun()
    const fresh = createTripState(
      stored,
      newTripId(),
      stored.map.tuning.seed ?? Math.floor(Math.random() * 2 ** 31),
    )
    await this.trips.writeState(fresh)
    await this.publish(fresh, Date.now())
    return { success: true, message: `New trip ready: ${stored.map.title}.` }
  }

  // ---------------------------------------------------------------------------
  // Room export (ADR 0206)
  // ---------------------------------------------------------------------------

  async augmentRoomExport(_exportData: RoomExportData): Promise<PluginExportAugmentation> {
    if (!this.context) return {}
    try {
      const state = await this.trips.readState()
      const stored = await this.mapFor(state)
      if (!state || !stored || state.departedAt === undefined) return {}
      const log = await this.trips.readLog()
      const config = (await this.getConfig()) ?? defaultRoadTripConfig
      const markdown = formatTripTimelineMarkdown({
        map: stored.map,
        state,
        log,
        timeZone: config.exportTimeZone,
      })
      const summary = {
        mapId: stored.map.id,
        mapTitle: stored.map.title,
        revision: stored.map.revision,
        hash: stored.hash,
        status: state.status,
        departedAt: state.departedAt,
        arrivedAt: state.arrivedAt ?? null,
        targetArrivalAt: state.targetArrivalAt ?? null,
        visitedSiteIds: Object.entries(state.sites)
          .filter(([, runtime]) => runtime.visitedAt !== undefined)
          .map(([siteId]) => siteId),
      }
      return { data: { summary, log }, markdownSections: [markdown] }
    } catch (error) {
      console.warn(`[road-trip] augmentRoomExport failed in ${this.context.roomId}:`, error)
      return {}
    }
  }
}

/**
 * Road-sign skip poll (M7). A low-fuel gas site is a `warning` service sign
 * whose eyebrow carries the urgent banner ("⛽ 12% · last gas for 20 mi").
 */
export function skipPollPresentation(
  site: TripSite,
  mystery: boolean,
  skipDefault: SkipDefault,
  urgency: string | null = null,
): PollPresentation {
  const eyebrow = urgency ?? (mystery ? undefined : `EXIT ${Math.round(site.mile)}`)
  return {
    theme: "road-trip",
    variant: urgency ? "warning" : "info",
    ...(eyebrow ? { eyebrow } : {}),
    headline: mystery ? "SOMETHING UP AHEAD" : site.name.toUpperCase().slice(0, 80),
    icon: mystery ? "❓" : site.icon,
    ...(!mystery && site.imageUrl ? { imageUrl: site.imageUrl } : {}),
    footnote: skipDefault === "stop" ? "No votes = pull off" : "No votes = keep driving",
    resultsInChat: true,
  }
}

/** Voluntary trip pool (gas or an incident cost) as the shared `pool-card` renders it (D17). */
export function poolCardView(pool: EscrowPoolState, fund: TripFund, map: TripMap): PoolCardView {
  const site = map.sites.find((s) => s.id === fund.siteId)
  const gal = Math.round(fund.gallons * 10) / 10
  const label = FUND_PURPOSE_LABELS[fund.purpose]
  const copy =
    fund.purpose === "gas"
      ? {
          icon: "⛽",
          subtitle: `${gal} gal at ${site?.name ?? "the station"}`,
          body: "The van fills up either way. Chip in so the attendant isn't left short.",
        }
      : {
          icon: fund.purpose === "tow" ? "🚚" : fund.purpose === "delivery" ? "⛽" : "🔧",
          subtitle: `${label} · ${fund.provider ?? "the mechanic"}`,
          body: "The job gets done either way. Chip in so nobody's left short.",
        }
  return {
    id: pool.id,
    title: pool.title,
    icon: copy.icon,
    eyebrow: `Road Trip · ${label} money`,
    subtitle: copy.subtitle,
    body: copy.body,
    goal: pool.goal,
    raised: pool.raised,
    startedAt: pool.openedAt,
    endsAt: pool.closesAt,
    open: pool.status === "open" && (pool.closesAt === null || pool.closesAt > Date.now()),
    topContributors: topContributors(pool).map(({ name, amount }) => ({ name, amount })),
  }
}

/** A closed pool's totals, per backer and in all. */
function poolOutcome(pool: EscrowPoolState | null): FundOutcome {
  if (!pool) return { collected: 0, payers: 0 }
  const paid = topContributors(pool, Number.MAX_SAFE_INTEGER)
  return {
    collected: pool.raised,
    payers: paid.length,
    topContributors: paid.slice(0, 3),
    paid,
  }
}
function newTripId(): string {
  return `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export { ROAD_TRIP_TAB_ID }

export function createRoadTripPlugin(configOverrides?: Partial<RoadTripConfig>): Plugin {
  return new RoadTripPlugin(configOverrides)
}

export default createRoadTripPlugin
