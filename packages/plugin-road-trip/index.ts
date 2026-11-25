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
  RoomExportData,
  SystemEventPayload,
} from "@repo/types"
import { BasePlugin, EscrowPoolHelper } from "@repo/plugin-base"
import {
  INCIDENT_PRESETS,
  isDestination,
  parseTripMap,
  resolveTripTuning,
  siteOpenRoomShopRequest,
  siteShopRequest,
  triggerableIncidentIdSchema,
  tripKeyIdForDefinition,
  tripKeyItemDefinitions,
  tripMapItemDefinitions,
  BOOK_BUFFS,
  BOOK_COPY,
  roadTripItemId,
  tripBook,
  type TripMap,
  type TripStore,
} from "@repo/road-trip-map"
import { SHOP_PRICE_ATTRIBUTE } from "@repo/game-logic"
import { ROAD_TRIP_ITEM_DEFINITIONS, routeItemUse, type RoadTripItemUse } from "./items"
import { readBook } from "./trip/books"
import packageJson from "./package.json"
import { getComponentSchema, getConfigSchema } from "./schema"
import {
  PLUGIN_NAME,
  POLL_RETRY_MS,
  ROAD_TRIP_TAB_ID,
  defaultRoadTripConfig,
  roadTripConfigSchema,
  type RoadTripConfig,
} from "./types"
import { applyTransition, contextFor, type AppliedTransition } from "./trip/commit"
import {
  dispatch,
  findVoteByPoll,
  openVoteTargets,
  pathFor,
  VOTE_SPECS,
  type VoteTarget,
} from "./trip/flow"
import { PARKED_AT_START } from "./trip/ledger"
import { buildStatusLines, buildTripStore, type TripStatusLines } from "./trip/projection"
import {
  conditionFacts,
  createTripState,
  TRIP_STORAGE_KEYS,
  type StoredTripMap,
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
  depart,
  endTrip,
  expireBlocker,
  finishPark,
  fuelThreshold,
  pourGas,
  gameSessionEnded,
  gameSessionStarted,
  pauseTrip,
  resumeTrip,
  revealSite,
  setFundsMode,
  type SignVariant,
  type Transition,
  type TripEffect,
} from "./trip/transitions"
import {
  advanceIncident,
  fireBeat,
  fireScripted,
  installPart,
  skipIncidentStep,
  triggerIncident,
  useIncidentItem,
} from "./trip/incidents"
import { openTripMap, revealAhead } from "./trip/guide"
import {
  giveItemsRecipients,
  giveItemsSign,
  narrateMessageMeta,
  tripNarrative,
} from "./trip/helpers"
import { TripFundHost } from "./trip/fundHost"
import { formatTripTimelineMarkdown } from "./export/formatTripTimelineMarkdown"
import { poolCardView } from "./presenters"

/** Car-lock chirp when a trip poll opens. The S3 object is private; this CDN URL is the public copy. */
const TRIP_POLL_SOUND_URL = "https://cdn.listeningroom.club/assets/sfx/car-lock-beep.mp3"

export { poolCardView, skipPollPresentation } from "./presenters"

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

/** Reader-scope book buffs carry this name prefix so `forget-books` can find them. */
const BOOK_MODIFIER_PREFIX = "road-trip-book:"

/** A backstop only: `forget-books` takes the buff off when the trip ends. */
const BOOK_BUFF_MAX_MS = 12 * 60 * 60_000

type Traveler = { userId: string; name: string }

type ItemRoute = Exclude<RoadTripItemUse, { kind: "refused" }>

function transitionForItem(route: ItemRoute, traveler: Traveler): Transition {
  switch (route.kind) {
    case "install":
      return installPart(route.partId, traveler)
    case "unlock-layers":
      return openTripMap(route.shortId, traveler)
    case "reveal-ahead":
      return revealAhead(route.shortId, traveler)
    case "read":
      return readBook(route.shortId, traveler)
    case "pour":
      return pourGas(route.gallons, traveler)
    case "resolve":
      return useIncidentItem(route.shortId, traveler)
  }
}

function itemUsedMessage(route: ItemRoute, name: string): string {
  switch (route.kind) {
    case "install":
      return `${name} installed.`
    case "read":
      return route.learned ? `You read ${name}.` : BOOK_COPY.overHead
    case "pour":
      return `${name} poured into the tank.`
    default:
      return `${name} used.`
  }
}

/**
 * Road Trip (ADR 0213): a van drives a Trip Map's route in real time. Progress
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

  /** Coin levy and voluntary pool (ADR 0217). The CAS loop stays on this class. */
  private get funds(): TripFundHost {
    return new TripFundHost({
      getContext: () => this.context,
      trips: () => this.trips,
      pool: () => this.tripPool,
      game: () => this.game,
      mutateTrip: (transition) => this.mutateTrip(transition),
      forTrip: (tripId, transition) => this.forTrip(tripId, transition),
      usernames: (userIds) => this.usernames(userIds),
      settle: () => this.settle(),
    })
  }

  /** Voluntary-mode escrow (ADR 0217). Only a host-waived incident fund refunds it. */
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
      "vote-due",
      "skip-poll",
      "arrive",
      "junction",
      "route-end",
      "expire",
      "fuel",
      "incident",
      "scripted",
      "beat",
    ]
    for (const kind of kinds) {
      this.onScheduled(kind, async (payload) =>
        this.handleThreshold(kind, payload as SchedulePayload),
      )
    }
    this.on("POLL_CLOSED", (data) => this.handlePollClosed(data))
    this.on("GAME_ECONOMY_SCALE_CHANGED", (data) => {
      if (data.roomId === context.roomId)
        this.costScaleCache = { value: data.costScale, at: Date.now() }
    })
    this.on("GAME_SESSION_ENDED", async () => {
      this.costScaleCache = null
      // An open pool closes and counts as short (M1 Status, D18).
      await this.funds.settleOpenFund()
      await this.mutateTrip(gameSessionEnded)
    })
    this.on("GAME_SESSION_STARTED", async () => {
      this.costScaleCache = null
      await this.mutateTrip(gameSessionStarted)
    })
    // A bought key item moves into the van (ADR 0230). Checked after the sale.
    this.on("INVENTORY_ITEM_ACQUIRED", (data) => this.intakeBoughtKey(data))
    this.onConfigChange(async ({ config, previousConfig }) => {
      if (config?.enabled !== previousConfig?.enabled) await this.syncVanPlayback()
    })
    this.registerTripMapItems().catch((error) =>
      console.warn(`[road-trip] couldn't register trip maps in ${context.roomId}`, error),
    )
    // Item Shops storage can outlive a restart or a missed clear; re-assert it.
    // `requestCapability` initializes Item Shops on demand, and
    // `PluginRegistry.initializePluginForRoom` has no in-flight guard, so this
    // relies on Item Shops being listed before Road Trip in
    // `packages/plugins/index.ts` (room sync awaits each plugin in order).
    this.syncVanPlayback().catch((error) =>
      console.warn(`[road-trip] couldn't sync van playback in ${context.roomId}`, error),
    )
  }

  /**
   * The loaded trip's maps (ADR 0227) and key items (ADR 0230) as inventory
   * items, so shops can sell them.
   */
  private async registerTripMapItems(map?: TripMap): Promise<void> {
    if (!this.context) return
    const source = map ?? (await this.trips.readMap())?.map
    const definitions = [...tripMapItemDefinitions(source), ...tripKeyItemDefinitions(source)]
    if (definitions.length > 0) this.context.inventory.registerItemDefinitions(definitions)
  }

  /**
   * The van is a playback device while a map is loaded and the plugin is
   * enabled (ADR 0223); otherwise Road Trip's shared playback is cleared.
   */
  private async syncVanPlayback(): Promise<void> {
    if (!this.context) return
    const config = await this.getConfig()
    const stored = config?.enabled ? await this.trips.readMap() : null
    const vanPlayback = stored ? resolveTripTuning(stored.map).vanPlayback : null
    await this.context.api.requestCapability(
      this.context.roomId,
      "shopAccess",
      "setSharedPlayback",
      PLUGIN_NAME,
      vanPlayback ? { formats: vanPlayback.formats, gentle: vanPlayback.gentle } : { formats: [] },
    )
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
    const before = await this.trips.readState()
    const stored = await this.mapFor(before)
    if (!stored || !before) return null
    const costScale = await this.costScale()
    const tallies = await this.openTallies(before)
    const now = Date.now()
    let applied: AppliedTransition | null = null
    try {
      await this.trips.updateState((prev) => {
        applied = null
        if (!prev || prev.map.hash !== stored.hash) throw new NoTripError()
        applied = applyTransition(prev, transition, stored.map, now, costScale, tallies)
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
   * Counts of every open room poll a vote holds, by option order, read before
   * the CAS: the only vote I/O a transition needs (arrival, tow, timeouts).
   * The room has one poll at a time, so this is at most one read.
   */
  private async openTallies(state: TripState): Promise<Record<string, number[]> | undefined> {
    if (!this.context) return undefined
    const tallies: Record<string, number[]> = {}
    for (const target of openVoteTargets(state)) {
      const vote = VOTE_SPECS[target.kind].read(state, target)
      if (!vote?.pollId || !vote.optionIds) continue
      const tally = await this.context.polls.tallyPoll(vote.pollId)
      tallies[vote.pollId] = vote.optionIds.map((id) => tally[id] ?? 0)
    }
    return Object.keys(tallies).length > 0 ? tallies : undefined
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
    console.warn(
      `[road-trip] settle didn't converge in ${this.context?.roomId}; next change re-arms`,
    )
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
    const { api, polls, roomId } = this.context
    for (const effect of effects) {
      try {
        switch (effect.type) {
          case "sign":
            await this.tripAnnounce(effect.variant, effect.title, effect.body, effect.icon)
            break
          case "narrate":
            await api.sendSystemMessage(roomId, effect.body, narrateMessageMeta(effect))
            break
          case "sound":
            // Clients drop this when Sound effects is off (soundEffectsMachine).
            await api.queueSoundEffect({ url: effect.url, volume: 0.6, duck: true })
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
              await polls.closePoll({
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
          case "open-vote":
            await this.openVote(state.tripId, effect.target)
            break
          case "open-fund":
            await this.funds.openFund(effect.fund, effect.title, state.tripId)
            break
          case "close-pool":
            await this.tripPool.close("trip-ended", { poolId: effect.fundId })
            break
          case "nudge-holders":
            await this.nudgeHolders(effect.itemIds, effect.message)
            break
          case "book-buff":
            await this.applyBookBuff(effect.userId, effect.shortId)
            break
          case "forget-books":
            await this.forgetBooks(effect.userIds)
            break
          case "give-items":
            await this.giveItems(effect, state)
            break
        }
      } catch (error) {
        console.error(`[road-trip] effect ${effect.type} failed in ${roomId}:`, error)
      }
    }
  }

  /**
   * A `give-item` outcome (ADR 0230): the item to every online traveler, or to
   * one of them, then a road sign naming who got it.
   */
  private async giveItems(
    effect: Extract<TripEffect, { type: "give-items" }>,
    state: TripState,
  ): Promise<void> {
    if (!this.context) return
    const { api, inventory, roomId } = this.context
    const recipients = giveItemsRecipients(effect, await api.getOnlineUserIds(roomId), state.seed)
    const given = await Promise.all(
      recipients.map(async (userId) =>
        (await inventory.giveItem(userId, effect.item, effect.qty, undefined, "plugin"))
          ? userId
          : null,
      ),
    )
    const got = given.filter((userId): userId is string => userId !== null)
    if (got.length === 0) return
    const definition = await inventory.getItemDefinition(effect.item)
    const usernames = effect.to === "random" ? await this.usernames(got) : new Map<string, string>()
    const names = got.map((userId) => usernames.get(userId) ?? "Someone")
    const sign = giveItemsSign(
      effect,
      {
        name: definition?.name ?? effect.item,
        ...(definition?.icon ? { icon: definition.icon } : {}),
      },
      names,
    )
    if (sign) await this.tripAnnounce(sign.variant, sign.title, sign.body, sign.icon)
  }

  /** Status messages go through here so they render as road signs (D25). Narrative does not. */
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
      return this.funds.waiveIncidentFund(state, fund)
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
    const name = INCIDENT_PRESETS[parsed.data].name
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
    const stored = await this.mapFor(state)
    const route = routeItemUse(state, definition.shortId, stored?.map, Date.now(), userId)
    if (route.kind === "refused" || !state) {
      return {
        success: false,
        consumed: false,
        message: route.kind === "refused" ? route.message : "There's no trip right now.",
      }
    }
    const name = (await this.usernames([userId])).get(userId) ?? "Someone"
    const traveler = { userId, name }
    const transition = transitionForItem(route, traveler)
    const saved = await this.mutateTrip(this.forTrip(state.tripId, transition))
    if (!saved) {
      return { success: false, consumed: false, message: "Too late: nothing to use it on now." }
    }
    return { success: true, consumed: true, message: itemUsedMessage(route, definition.name) }
  }

  /** A reader-scope book's buff, until the trip ends (`forget-books`) or the session does. */
  private async applyBookBuff(userId: string, shortId: string): Promise<void> {
    const book = tripBook(shortId)
    if (!book) return
    const buff =
      book.series === "investment"
        ? { target: "coin" as const, value: BOOK_BUFFS.investmentCoinMultiplier }
        : book.series === "negotiating"
          ? { target: SHOP_PRICE_ATTRIBUTE, value: BOOK_BUFFS.negotiatingPriceScale }
          : null
    if (!buff) return
    await this.game.applyTimedModifier(
      userId,
      BOOK_BUFF_MAX_MS,
      {
        name: `${BOOK_MODIFIER_PREFIX}${book.series}`,
        effects: [{ type: "multiplier", ...buff, intent: "positive" }],
        stackBehavior: "replace",
        itemDefinitionId: roadTripItemId(shortId),
      },
      userId,
    )
  }

  private async forgetBooks(userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      const state = await this.game.getUserState(userId)
      for (const modifier of state?.modifiers ?? []) {
        if (modifier.name.startsWith(BOOK_MODIFIER_PREFIX)) {
          await this.game.removeModifier(userId, modifier.id)
        }
      }
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
    const state = await this.trips.readState()
    const request = site
      ? siteOpenRoomShopRequest(site, scopeId, state ? conditionFacts(state) : undefined)
      : null
    if (!site || !request) return null
    const result = await this.context.api.requestCapability(
      this.context.roomId,
      "shopAccess",
      "openRoomShop",
      request,
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

  /**
   * A bought trip key moves from the buyer into the van (ADR 0230). With no
   * running trip, or a key this map doesn't define, the item stays put.
   * `KEY_GIVE` runs only after the remove, and does nothing when the van
   * already holds the key.
   */
  private async intakeBoughtKey(
    data: SystemEventPayload<"INVENTORY_ITEM_ACQUIRED">,
  ): Promise<void> {
    const context = this.context
    if (!context || data.roomId !== context.roomId) return
    const keyId = tripKeyIdForDefinition(data.item.definitionId)
    if (!keyId) return
    const state = await this.trips.readState()
    if (!state || (state.status !== "loaded" && state.status !== "driving")) return
    const stored = await this.mapFor(state)
    if (!stored?.map.keyItems?.some((key) => key.id === keyId)) return
    const removed = await context.inventory.removeItem(data.userId, data.item.itemId, 1)
    if (!removed) return
    const name = (await this.usernames([data.userId])).get(data.userId) ?? "Someone"
    await this.mutateTrip(
      this.forTrip(
        state.tripId,
        dispatch({
          type: "KEY_GIVE",
          key: keyId,
          by: { kind: "purchase", userId: data.userId, name },
        }),
      ),
    )
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
      log: await this.trips.readLog(),
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
    const { tripId, siteId, routeId, blockerId, level, incidentId, step, eventId, beat } = payload
    switch (kind) {
      case "vote-due":
      case "skip-poll":
        if (routeId) await this.openVote(tripId, { kind: "junction", id: routeId })
        else if (siteId) await this.openVote(tripId, { kind: "site", id: siteId })
        return
      case "junction":
        if (routeId)
          await this.mutateTrip(this.forTrip(tripId, dispatch({ type: "JUNCTION_REACH", routeId })))
        return
      case "route-end":
        if (routeId)
          await this.mutateTrip(this.forTrip(tripId, dispatch({ type: "ROUTE_END", routeId })))
        return
      case "beat":
        if (eventId && beat !== undefined)
          await this.mutateTrip(this.forTrip(tripId, fireBeat(eventId, beat)))
        return
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
        if (siteId) await this.mutateTrip(this.forTrip(tripId, arriveAtSite(siteId)))
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
        await this.funds.settleOpenFund(state.fund.id)
      }
      return
    }
    await this.mutateTrip(this.forTrip(tripId, expireBlocker(blockerId)))
  }

  /**
   * Open a vote's room poll (ADR 0222): sites, junctions, and event choices
   * alike. Copy and timing come from the vote's spec; a busy room retries
   * until the spec's give-up time, then the default applies.
   */
  private async openVote(tripId: string, target: VoteTarget): Promise<void> {
    if (!this.context) return
    const state = await this.trips.readState()
    const stored = await this.mapFor(state)
    const leg = state?.leg
    if (!state || !stored || !leg || state.tripId !== tripId || state.status !== "driving") return
    const now = Date.now()
    const ctx = contextFor(state, stored.map, now, await this.costScale())
    const spec = VOTE_SPECS[target.kind]
    if (spec.read(state, target)?.phase !== "pending" || !spec.votable(state, ctx, target)) return
    const prompt = spec.prompt(state, ctx, target, leg)
    if (!prompt) return
    const applyDefault = () =>
      this.mutateTrip(this.forTrip(tripId, dispatch({ type: "VOTE_CLOSED", target })))
    const creator = prompt.kind === "open" ? await this.roomCreator() : null
    if (prompt.kind === "default" || !creator) {
      await applyDefault()
      return
    }
    const created = await this.context.polls.createPoll({
      roomId: this.context.roomId,
      userId: creator,
      question: prompt.question,
      options: prompt.options.map((label) => ({ label })),
      closesAt: prompt.closesAt,
      announce: false,
      ...(prompt.presentation ? { presentation: prompt.presentation } : {}),
    })
    if (!created.ok) {
      const retryAt = now + POLL_RETRY_MS
      if (created.error.status === 409 && retryAt < prompt.giveUpAt) {
        await this.mutateTrip(
          this.forTrip(tripId, dispatch({ type: "VOTE_DEFERRED", target, retryAt })),
        )
      } else {
        await applyDefault()
      }
      return
    }
    const optionIds = created.poll.options.map((option) => option.id)
    const marked =
      optionIds.length === prompt.options.length
        ? await this.mutateTrip(
            this.forTrip(
              tripId,
              dispatch({ type: "VOTE_OPENED", target, pollId: created.poll.id, optionIds }),
            ),
          )
        : null
    if (!marked) {
      await this.context.polls.closePoll({
        roomId: this.context.roomId,
        userId: creator,
        pollId: created.poll.id,
        announce: false,
      })
      return
    }
    // Clients drop this when Sound effects is off (soundEffectsMachine).
    await this.context.api.queueSoundEffect({
      url: TRIP_POLL_SOUND_URL,
      volume: 0.6,
      duck: true,
    })
  }

  private async handlePollClosed(data: SystemEventPayload<"POLL_CLOSED">): Promise<void> {
    if (!this.context || data.roomId !== this.context.roomId) return
    const state = await this.trips.readState()
    if (!state) return
    const found = findVoteByPoll(state, data.poll.id)
    if (!found) return
    const optionIds = found.vote.optionIds ?? data.poll.options.map((option) => option.id)
    const tallies = data.results.optionTallies
    const tally = optionIds.map((id) => tallies[id] ?? 0)
    await this.mutateTrip(
      this.forTrip(
        state.tripId,
        dispatch({ type: "VOTE_CLOSED", target: found.target, pollId: data.poll.id, tally }),
      ),
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
    if (action === "chipIn") return this.funds.chipIn(initiator, params)
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
        await this.funds.settleOpenFund()
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
    const settledFund = await this.funds.settleOpenFund()
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
    await this.registerTripMapItems(parsed.map)
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
    await this.syncVanPlayback()

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
      const request = siteShopRequest(site)
      if (!request) continue
      const result = await this.context!.api.requestCapability(
        this.context!.roomId,
        "shopAccess",
        "validateShop",
        request,
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
    await this.syncVanPlayback()
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
  // Room export (ADR 0219)
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
      const narrative = tripNarrative(stored.map, state.sites)
      return { data: { summary, log, narrative }, markdownSections: [markdown] }
    } catch (error) {
      console.warn(`[road-trip] augmentRoomExport failed in ${this.context.roomId}:`, error)
      return {}
    }
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
