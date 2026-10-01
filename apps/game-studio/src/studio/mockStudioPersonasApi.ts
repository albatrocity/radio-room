import type {
  PersonaDefinition,
  PersonasPluginAPI,
  UserPersona,
  UserPersonaAssignment,
} from "@repo/types"
import { PLATFORM_PERSONA_DEFINITIONS, PLUGIN_ID_PREFIX } from "@repo/types"

/** In-memory personas for the sandbox room; not persisted with the studio snapshot. */
export class MockStudioPersonasApi implements PersonasPluginAPI {
  private readonly definitions = new Map<string, PersonaDefinition>(
    PLATFORM_PERSONA_DEFINITIONS.map((d) => [d.id, d]),
  )
  private readonly assignments = new Map<string, UserPersonaAssignment[]>()

  constructor(private readonly pluginName: string) {}

  private resolveId(shortOrFullId: string): string {
    return shortOrFullId.startsWith(PLUGIN_ID_PREFIX)
      ? shortOrFullId
      : `${PLUGIN_ID_PREFIX}${this.pluginName}:${shortOrFullId}`
  }

  async registerPersonas(
    definitions: (Omit<PersonaDefinition, "source" | "id"> & { id: string })[],
  ): Promise<void> {
    for (const d of definitions) {
      const id = this.resolveId(d.id)
      this.definitions.set(id, { ...d, id, source: this.pluginName })
    }
  }

  async unregisterPersonas(): Promise<void> {
    for (const [id, d] of this.definitions) {
      if (d.source === this.pluginName) this.definitions.delete(id)
    }
    for (const [userId, list] of this.assignments) {
      this.assignments.set(
        userId,
        list.filter((a) => this.definitions.has(a.personaId)),
      )
    }
  }

  async getRoomPersonas(): Promise<PersonaDefinition[]> {
    return [...this.definitions.values()]
  }

  async assign(userId: string, personaId: string, assignedBy = this.pluginName): Promise<void> {
    const id = this.resolveId(personaId)
    const list = (this.assignments.get(userId) ?? []).filter((a) => a.personaId !== id)
    list.push({ personaId: id, assignedBy, assignedAt: new Date().toISOString() })
    this.assignments.set(userId, list)
  }

  async remove(userId: string, personaId: string): Promise<void> {
    const id = this.resolveId(personaId)
    const list = this.assignments.get(userId)
    if (list) this.assignments.set(userId, list.filter((a) => a.personaId !== id))
  }

  async getUserPersonas(userId: string): Promise<UserPersonaAssignment[]> {
    return [...(this.assignments.get(userId) ?? [])]
  }

  async getUserPersonasHydrated(userId: string): Promise<UserPersona[]> {
    return (this.assignments.get(userId) ?? []).flatMap((a) => {
      const d = this.definitions.get(a.personaId)
      if (!d) return []
      return [
        {
          personaId: d.id,
          label: d.label,
          icon: d.icon,
          decoratesUser: d.decoratesUser,
          decoratesChatMessage: d.decoratesChatMessage,
          excludeFromRoomExport: d.excludeFromRoomExport,
        },
      ]
    })
  }

  async getUsersWithPersona(personaId: string): Promise<string[]> {
    return [...this.assignments]
      .filter(([, list]) => list.some((a) => a.personaId === personaId))
      .map(([userId]) => userId)
  }
}
