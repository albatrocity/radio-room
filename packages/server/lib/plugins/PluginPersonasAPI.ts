import {
  AppContext,
  type PersonaDefinition,
  type PersonasPluginAPI,
  type UserPersona,
  type UserPersonaAssignment,
} from "@repo/types"
import { PersonaService, pluginPersonaId } from "../../services/PersonaService"

/**
 * Per-plugin, per-room view onto {@link PersonaService}.
 */
export class PluginPersonasAPI implements PersonasPluginAPI {
  constructor(
    private readonly context: AppContext,
    private readonly pluginName: string,
    private readonly roomId: string,
  ) {}

  private get service(): PersonaService | null {
    return (this.context.personas as PersonaService | undefined) ?? null
  }

  private resolveId(shortOrFullId: string): string {
    if (shortOrFullId.startsWith("plugin:")) {
      const owned = shortOrFullId.startsWith(`plugin:${this.pluginName}:`)
      if (!owned) {
        throw new Error(
          `[PluginPersonasAPI] Cannot use persona id "${shortOrFullId}" from plugin "${this.pluginName}"`,
        )
      }
      return shortOrFullId
    }
    return pluginPersonaId(this.pluginName, shortOrFullId)
  }

  private assertOwns(personaId: string): void {
    if (!personaId.startsWith(`plugin:${this.pluginName}:`)) {
      throw new Error(
        `[PluginPersonasAPI] Plugin "${this.pluginName}" cannot modify persona "${personaId}"`,
      )
    }
  }

  async registerPersonas(
    definitions: (Omit<PersonaDefinition, "source" | "id"> & { id: string })[],
  ): Promise<void> {
    if (!this.service || definitions.length === 0) return
    const full: PersonaDefinition[] = definitions.map((d) => ({
      ...d,
      id: pluginPersonaId(this.pluginName, d.id),
      source: this.pluginName,
    }))
    await this.service.registerDefinitions(this.roomId, full)
  }

  async unregisterPersonas(): Promise<void> {
    if (!this.service) return
    await this.service.unregisterPluginPersonas(this.roomId, this.pluginName)
  }

  async getRoomPersonas(): Promise<PersonaDefinition[]> {
    if (!this.service) return []
    return this.service.getRoomDefinitions(this.roomId)
  }

  async assign(userId: string, personaId: string, assignedBy?: string): Promise<void> {
    if (!this.service) return
    const fullId = this.resolveId(personaId)
    this.assertOwns(fullId)
    await this.service.assignPersona({
      roomId: this.roomId,
      userId,
      personaId: fullId,
      assignedBy: assignedBy ?? this.pluginName,
    })
  }

  async remove(userId: string, personaId: string): Promise<void> {
    if (!this.service) return
    const fullId = this.resolveId(personaId)
    this.assertOwns(fullId)
    await this.service.removePersona({
      roomId: this.roomId,
      userId,
      personaId: fullId,
    })
  }

  async getUserPersonas(userId: string): Promise<UserPersonaAssignment[]> {
    if (!this.service) return []
    return this.service.getUserAssignments(this.roomId, userId)
  }

  async getUserPersonasHydrated(userId: string): Promise<UserPersona[]> {
    if (!this.service) return []
    return this.service.getUserPersonasHydrated(this.roomId, userId)
  }

  async getUsersWithPersona(personaId: string): Promise<string[]> {
    if (!this.service) return []
    const fullId = personaId.startsWith("plugin:") ? personaId : this.resolveId(personaId)
    return this.service.getUsersWithPersona(this.roomId, fullId)
  }
}
