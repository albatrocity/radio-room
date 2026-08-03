import type { PersonasPluginAPI, PluginContext } from "@repo/types"
import { getEligibleUserIds, shouldUseExclusiveRobin } from "./state"
import { ROBIN_PERSONA_ID, type RoundRobinState } from "./types"

export type RobinPersonaSyncDeps = {
  getContext: () => PluginContext | null
  getPersonas: () => PersonasPluginAPI
}

/**
 * Registers and assigns the Robin persona to currently eligible deputies.
 */
export class RobinPersonaSync {
  private robinExclusive: boolean | null = null

  constructor(private readonly deps: RobinPersonaSyncDeps) {}

  /** Call when the plugin is disabled so the next enable re-registers. */
  reset(): void {
    this.robinExclusive = null
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

    const eligible = new Set(getEligibleUserIds(state))
    const holders = await personas.getUsersWithPersona(ROBIN_PERSONA_ID)

    for (const userId of holders) {
      if (!eligible.has(userId)) {
        await personas.remove(userId, ROBIN_PERSONA_ID)
      }
    }

    for (const userId of eligible) {
      if (!holders.includes(userId)) {
        await personas.assign(userId, ROBIN_PERSONA_ID)
      }
    }
  }

  async clearAssignments(): Promise<void> {
    const context = this.deps.getContext()
    if (!context) return
    const personas = this.deps.getPersonas()
    const holders = await personas.getUsersWithPersona(ROBIN_PERSONA_ID)
    for (const userId of holders) {
      await personas.remove(userId, ROBIN_PERSONA_ID)
    }
  }
}
