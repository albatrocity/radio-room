import {
  AppContext,
  toAdminAssignablePersonas,
  type PersonaDefinition,
  type User,
  type UserPersona,
  type UserPersonaAssignment,
} from "@repo/types"
import {
  ensurePlatformPersonaDefinitions,
  getOnlineUserIdsWithPersona,
  getPersonaDefinition,
  getPersonaDefinitions,
  getUserPersonaAssignments,
  hydrateUserPersonas,
  hydrateUsersWithPersonas,
  removePersonaDefinitionsBySource,
  removeUserPersonaAssignment,
  setPersonaDefinitions,
  setUserPersonaAssignment,
  stripPersonaAssignmentsFromRoom,
} from "../operations/data/personas"
import { getRoomUsers } from "../operations/data/users"

export function pluginPersonaId(pluginName: string, shortId: string): string {
  return `plugin:${pluginName}:${shortId}`
}

export function parsePluginPersonaId(
  personaId: string,
): { pluginName: string; shortId: string } | null {
  const match = /^plugin:([^:]+):(.+)$/.exec(personaId)
  if (!match) return null
  return { pluginName: match[1]!, shortId: match[2]! }
}

/**
 * Core service for room-scoped user personas (VIP + plugin-defined labels).
 */
export class PersonaService {
  constructor(private readonly context: AppContext) {}

  async getRoomDefinitions(roomId: string): Promise<PersonaDefinition[]> {
    return getPersonaDefinitions({ context: this.context, roomId })
  }

  async registerDefinitions(roomId: string, definitions: PersonaDefinition[]): Promise<void> {
    await ensurePlatformPersonaDefinitions({ context: this.context, roomId })
    await setPersonaDefinitions({ context: this.context, roomId, definitions })
    await this.emitAssignablePersonasUpdated(roomId)
  }

  async unregisterPluginPersonas(roomId: string, pluginName: string): Promise<void> {
    const removedIds = await removePersonaDefinitionsBySource({
      context: this.context,
      roomId,
      source: pluginName,
    })
    if (removedIds.length === 0) {
      await this.emitAssignablePersonasUpdated(roomId)
      return
    }
    const onlineUserIds = await this.context.redis.pubClient.sMembers(
      `room:${roomId}:online_users`,
    )
    await stripPersonaAssignmentsFromRoom({
      context: this.context,
      roomId,
      personaIds: removedIds,
      onlineUserIds,
    })
    await this.emitAssignablePersonasUpdated(roomId)
  }

  private async emitAssignablePersonasUpdated(roomId: string): Promise<void> {
    if (!this.context.systemEvents) return
    const definitions = await getPersonaDefinitions({ context: this.context, roomId })
    await this.context.systemEvents.emit(roomId, "PERSONA_DEFINITIONS_UPDATED", {
      roomId,
      assignablePersonas: toAdminAssignablePersonas(definitions),
    })
  }

  async getUserAssignments(
    roomId: string,
    userId: string,
  ): Promise<UserPersonaAssignment[]> {
    return getUserPersonaAssignments({ context: this.context, roomId, userId })
  }

  async getUserPersonasHydrated(roomId: string, userId: string): Promise<UserPersona[]> {
    return hydrateUserPersonas({ context: this.context, roomId, userId })
  }

  async userHasPersona(roomId: string, userId: string, personaId: string): Promise<boolean> {
    const assignments = await getUserPersonaAssignments({
      context: this.context,
      roomId,
      userId,
    })
    return assignments.some((a) => a.personaId === personaId)
  }

  async getUsersWithPersona(roomId: string, personaId: string): Promise<string[]> {
    return getOnlineUserIdsWithPersona({ context: this.context, roomId, personaId })
  }

  async hydrateRoomUsers(roomId: string, users: User[]): Promise<User[]> {
    return hydrateUsersWithPersonas({ context: this.context, roomId, users })
  }

  /**
   * Assign a persona to a user. Enforces definition exists and exclusive cardinality.
   */
  async assignPersona({
    roomId,
    userId,
    personaId,
    assignedBy,
  }: {
    roomId: string
    userId: string
    personaId: string
    assignedBy: string
  }): Promise<{ assigned: boolean; user: User | null; users: User[] }> {
    await ensurePlatformPersonaDefinitions({ context: this.context, roomId })
    const def = await getPersonaDefinition({ context: this.context, roomId, personaId })
    if (!def) {
      return { assigned: false, user: null, users: [] }
    }

    if (def.exclusive) {
      const holders = await getOnlineUserIdsWithPersona({
        context: this.context,
        roomId,
        personaId,
      })
      await Promise.all(
        holders
          .filter((id) => id !== userId)
          .map((id) =>
            removeUserPersonaAssignment({
              context: this.context,
              roomId,
              userId: id,
              personaId,
            }),
          ),
      )
    }

    const assignment: UserPersonaAssignment = {
      personaId,
      assignedBy,
      assignedAt: new Date().toISOString(),
    }
    await setUserPersonaAssignment({
      context: this.context,
      roomId,
      userId,
      assignment,
    })

    const users = await getRoomUsers({ context: this.context, roomId })
    const hydrated = await hydrateUsersWithPersonas({
      context: this.context,
      roomId,
      users,
    })
    const user = hydrated.find((u) => u.userId === userId) ?? null

    if (user && this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "PERSONA_ASSIGNED", {
        roomId,
        userId,
        personaId,
        user,
        users: hydrated,
      })
    }

    return { assigned: true, user, users: hydrated }
  }

  async removePersona({
    roomId,
    userId,
    personaId,
  }: {
    roomId: string
    userId: string
    personaId: string
  }): Promise<{ removed: boolean; user: User | null; users: User[] }> {
    const removed = await removeUserPersonaAssignment({
      context: this.context,
      roomId,
      userId,
      personaId,
    })
    const users = await getRoomUsers({ context: this.context, roomId })
    const hydrated = await hydrateUsersWithPersonas({
      context: this.context,
      roomId,
      users,
    })
    const user = hydrated.find((u) => u.userId === userId) ?? null

    if (removed && user && this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "PERSONA_REMOVED", {
        roomId,
        userId,
        personaId,
        user,
        users: hydrated,
      })
    }

    return { removed, user, users: hydrated }
  }

}
