import type { PluginStorage } from "@repo/types"
import type { Leg } from "./ledger"
import {
  MAX_LEGS,
  MAX_LOG_ENTRIES,
  TRIP_STORAGE_KEYS as KEYS,
  type ArmedSchedules,
  type StoredTripMap,
  type TripLogEntry,
  type TripState,
} from "./state"

/** Typed access to road-trip's plugin storage keys (M1 State). */
export class TripStorage {
  constructor(private readonly storage: PluginStorage) {}

  async readMap(): Promise<StoredTripMap | null> {
    return (await this.storage.getJson<StoredTripMap>(KEYS.MAP)).value
  }

  async writeMap(stored: StoredTripMap): Promise<void> {
    await this.storage.setJson(KEYS.MAP, stored)
  }

  async readState(): Promise<TripState | null> {
    return (await this.storage.getJson<TripState>(KEYS.STATE)).value
  }

  async writeState(state: TripState): Promise<void> {
    await this.storage.setJson(KEYS.STATE, state)
  }

  updateState(fn: (prev: TripState | null) => TripState): Promise<TripState> {
    return this.storage.updateJson<TripState>(KEYS.STATE, fn)
  }

  /** History only; the leg in force is `TripState.leg`. */
  async appendLeg(leg: Leg): Promise<void> {
    await this.storage.appendCapped(KEYS.LEGS, leg, MAX_LEGS)
  }

  async appendLog(entry: TripLogEntry): Promise<void> {
    await this.storage.appendCapped(KEYS.LOG, entry, MAX_LOG_ENTRIES)
  }

  /** Whole log, oldest first. */
  async readLog(): Promise<TripLogEntry[]> {
    const raw = await this.storage.lrange(KEYS.LOG, 0, -1)
    return raw.map((line) => JSON.parse(line) as TripLogEntry).reverse()
  }

  async readArmed(): Promise<ArmedSchedules> {
    const { value } = await this.storage.getJson<ArmedSchedules | string[]>(KEYS.ARMED)
    if (!value) return {}
    // Pre-diff format: a list of ids. A 0 fire time forces a re-arm.
    if (Array.isArray(value)) return Object.fromEntries(value.map((id) => [id, 0]))
    return value
  }

  async writeArmed(armed: ArmedSchedules): Promise<void> {
    await this.storage.setJson(KEYS.ARMED, armed)
  }

  /** A schedule fired: drop it so the next settle re-arms it if still wanted. */
  async forgetArmed(id: string): Promise<void> {
    await this.storage.updateJson<ArmedSchedules>(KEYS.ARMED, (prev) => {
      const next = { ...(prev && !Array.isArray(prev) ? prev : {}) }
      delete next[id]
      return next
    })
  }

  async readShopWarning(): Promise<string | null> {
    return (await this.storage.getJson<string>(KEYS.SHOP_WARNING)).value
  }

  async writeShopWarning(warning: string | null): Promise<void> {
    if (warning === null) await this.storage.del(KEYS.SHOP_WARNING)
    else await this.storage.setJson(KEYS.SHOP_WARNING, warning)
  }

  /** Clear the run (legs, log, state, shop warning) but keep the map: "New trip". */
  async clearRun(): Promise<void> {
    await this.storage.del(KEYS.LEGS)
    await this.storage.del(KEYS.LOG)
    await this.storage.del(KEYS.STATE)
    await this.storage.del(KEYS.SHOP_WARNING)
  }

  async clearAll(): Promise<void> {
    await this.clearRun()
    await this.storage.del(KEYS.MAP)
  }
}
