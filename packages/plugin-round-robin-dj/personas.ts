import type { PersonasPluginAPI, PluginContext } from "@repo/types"
import { getEligibleUserIds, shouldUseExclusiveRobin } from "./state"
import { ROBIN_PERSONA_ID, type RoundRobinState } from "./types"

export type RobinPersonaSyncDeps = {
  getContext: () => PluginContext | null
  getPersonas: () => PersonasPluginAPI
}

function eligibleSyncKey(exclusive: boolean, eligible: readonly string[]): string {
  return `${exclusive ? "1" : "0"}:${[...eligible].sort().join(",")}`
}

/**
 * Registers and assigns the Robin persona to currently eligible deputies.
 */
export class RobinPersonaSync {
  private robinExclusive: boolean | null = null
  /** Last successfully synced eligibility fingerprint (skips Redis when unchanged). */
  private lastSyncedKey: string | null = null

  constructor(private readonly deps: RobinPersonaSyncDeps) {}

  /** Call when the plugin is disabled so the next enable re-registers. */
  reset(): void {
    this.robinExclusive = null
    this.lastSyncedKey = null
  }

  async sync(state: RoundRobinState): Promise<void> {
    const context = this.deps.getContext()
    if (!context) return

    const personas = this.deps.getPersonas()
    const exclusive = shouldUseExclusiveRobin(state)
    if (this.robinExclusive === null || this.robinExclusive !== exclusive) {
      await personas.registerPersonas([
        {
          id: ROBIN_PERSONA_ID,
          label: "Robin",
          icon: "Bird",
          exclusive,
          assignableByAdmin: true,
          decoratesUser: true,
          decoratesChatMessage: true,
        },
      ])
      this.robinExclusive = exclusive
    }

    const eligible = getEligibleUserIds(state)
    const syncKey = eligibleSyncKey(exclusive, eligible)
    if (syncKey === this.lastSyncedKey) {
      return
    }

    const eligibleSet = new Set(eligible)
    const holders = await personas.getUsersWithPersona(ROBIN_PERSONA_ID)
    const holderSet = new Set(holders)

    const sameMembership =
      eligibleSet.size === holderSet.size && [...eligibleSet].every((id) => holderSet.has(id))
    if (sameMembership) {
      this.lastSyncedKey = syncKey
      return
    }

    const toRemove = holders.filter((userId) => !eligibleSet.has(userId))
    const toAdd = eligible.filter((userId) => !holderSet.has(userId))

    await Promise.all(toRemove.map((userId) => personas.remove(userId, ROBIN_PERSONA_ID)))
    await Promise.all(toAdd.map((userId) => personas.assign(userId, ROBIN_PERSONA_ID)))

    this.lastSyncedKey = syncKey
  }

  async clearAssignments(): Promise<void> {
    const context = this.deps.getContext()
    if (!context) return
    const personas = this.deps.getPersonas()
    const holders = await personas.getUsersWithPersona(ROBIN_PERSONA_ID)
    await Promise.all(holders.map((userId) => personas.remove(userId, ROBIN_PERSONA_ID)))
    this.lastSyncedKey = null
  }
}
