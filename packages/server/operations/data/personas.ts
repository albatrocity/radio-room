import { isTruthy } from "remeda"
import {
  AppContext,
  PLATFORM_PERSONA_DEFINITIONS,
  type PersonaDefinition,
  type User,
  type UserPersona,
  type UserPersonaAssignment,
} from "@repo/types"

function definitionsKey(roomId: string) {
  return `room:${roomId}:persona:definitions`
}

function assignmentsKey(roomId: string, userId: string) {
  return `room:${roomId}:personas:${userId}`
}

export async function ensurePlatformPersonaDefinitions({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}): Promise<void> {
  const key = definitionsKey(roomId)
  const entries: Record<string, string> = {}
  for (const def of PLATFORM_PERSONA_DEFINITIONS) {
    entries[def.id] = JSON.stringify(def)
  }
  await context.redis.pubClient.hSet(key, entries)
}

export async function setPersonaDefinitions({
  context,
  roomId,
  definitions,
}: {
  context: AppContext
  roomId: string
  definitions: PersonaDefinition[]
}): Promise<void> {
  if (definitions.length === 0) return
  const key = definitionsKey(roomId)
  const entries: Record<string, string> = {}
  for (const def of definitions) {
    entries[def.id] = JSON.stringify(def)
  }
  await context.redis.pubClient.hSet(key, entries)
}

export async function removePersonaDefinitionsBySource({
  context,
  roomId,
  source,
}: {
  context: AppContext
  roomId: string
  source: string
}): Promise<string[]> {
  const all = await getPersonaDefinitions({ context, roomId })
  const toRemove = all.filter((d) => d.source === source).map((d) => d.id)
  if (toRemove.length === 0) return []
  await context.redis.pubClient.hDel(definitionsKey(roomId), toRemove)
  return toRemove
}

export async function getPersonaDefinitions({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}): Promise<PersonaDefinition[]> {
  try {
    await ensurePlatformPersonaDefinitions({ context, roomId })
    const raw = await context.redis.pubClient.hGetAll(definitionsKey(roomId))
    return Object.values(raw)
      .map((json) => {
        try {
          return JSON.parse(json) as PersonaDefinition
        } catch {
          return null
        }
      })
      .filter(isTruthy)
  } catch (e) {
    console.log("ERROR FROM data/personas/getPersonaDefinitions", roomId)
    console.error(e)
    return [...PLATFORM_PERSONA_DEFINITIONS]
  }
}

export async function getPersonaDefinition({
  context,
  roomId,
  personaId,
}: {
  context: AppContext
  roomId: string
  personaId: string
}): Promise<PersonaDefinition | null> {
  const defs = await getPersonaDefinitions({ context, roomId })
  return defs.find((d) => d.id === personaId) ?? null
}

export async function getUserPersonaAssignments({
  context,
  roomId,
  userId,
}: {
  context: AppContext
  roomId: string
  userId: string
}): Promise<UserPersonaAssignment[]> {
  try {
    const raw = await context.redis.pubClient.hGetAll(assignmentsKey(roomId, userId))
    return Object.values(raw)
      .map((json) => {
        try {
          return JSON.parse(json) as UserPersonaAssignment
        } catch {
          return null
        }
      })
      .filter(isTruthy)
  } catch (e) {
    console.log("ERROR FROM data/personas/getUserPersonaAssignments", roomId, userId)
    console.error(e)
    return []
  }
}

export async function setUserPersonaAssignment({
  context,
  roomId,
  userId,
  assignment,
}: {
  context: AppContext
  roomId: string
  userId: string
  assignment: UserPersonaAssignment
}): Promise<void> {
  await context.redis.pubClient.hSet(
    assignmentsKey(roomId, userId),
    assignment.personaId,
    JSON.stringify(assignment),
  )
}

export async function removeUserPersonaAssignment({
  context,
  roomId,
  userId,
  personaId,
}: {
  context: AppContext
  roomId: string
  userId: string
  personaId: string
}): Promise<boolean> {
  const removed = await context.redis.pubClient.hDel(assignmentsKey(roomId, userId), personaId)
  return removed > 0
}

export async function removeUserPersonaAssignmentsByIds({
  context,
  roomId,
  userId,
  personaIds,
}: {
  context: AppContext
  roomId: string
  userId: string
  personaIds: string[]
}): Promise<void> {
  if (personaIds.length === 0) return
  await context.redis.pubClient.hDel(assignmentsKey(roomId, userId), personaIds)
}

export async function clearUserPersonaAssignments({
  context,
  roomId,
  userId,
}: {
  context: AppContext
  roomId: string
  userId: string
}): Promise<void> {
  await context.redis.pubClient.del(assignmentsKey(roomId, userId))
}

export async function hydrateUserPersonas({
  context,
  roomId,
  userId,
}: {
  context: AppContext
  roomId: string
  userId: string
}): Promise<UserPersona[]> {
  const [assignments, definitions] = await Promise.all([
    getUserPersonaAssignments({ context, roomId, userId }),
    getPersonaDefinitions({ context, roomId }),
  ])
  const defById = new Map(definitions.map((d) => [d.id, d]))
  return assignments
    .map((a) => {
      const def = defById.get(a.personaId)
      if (!def) return null
      return {
        personaId: a.personaId,
        label: def.label,
        icon: def.icon,
        ...(def.decoratesUser ? { decoratesUser: true } : {}),
        ...(def.decoratesChatMessage ? { decoratesChatMessage: true } : {}),
      }
    })
    .filter(isTruthy)
}

export async function hydrateUsersWithPersonas({
  context,
  roomId,
  users,
}: {
  context: AppContext
  roomId: string
  users: User[]
}): Promise<User[]> {
  if (users.length === 0) return users
  const hydrated = await Promise.all(
    users.map(async (user) => {
      const personas = await hydrateUserPersonas({ context, roomId, userId: user.userId })
      if (personas.length === 0) {
        const { personas: _removed, ...rest } = user
        return rest as User
      }
      return { ...user, personas }
    }),
  )
  return hydrated
}

export async function getOnlineUserIdsWithPersona({
  context,
  roomId,
  personaId,
}: {
  context: AppContext
  roomId: string
  personaId: string
}): Promise<string[]> {
  try {
    const userIds = await context.redis.pubClient.sMembers(`room:${roomId}:online_users`)
    const matches: string[] = []
    for (const userId of userIds) {
      const has = await context.redis.pubClient.hExists(assignmentsKey(roomId, userId), personaId)
      if (has) matches.push(userId)
    }
    return matches
  } catch (e) {
    console.log("ERROR FROM data/personas/getOnlineUserIdsWithPersona", roomId, personaId)
    console.error(e)
    return []
  }
}

export async function stripPersonaAssignmentsFromRoom({
  context,
  roomId,
  personaIds,
  onlineUserIds,
}: {
  context: AppContext
  roomId: string
  personaIds: string[]
  onlineUserIds: string[]
}): Promise<void> {
  if (personaIds.length === 0) return
  await Promise.all(
    onlineUserIds.map((userId) =>
      removeUserPersonaAssignmentsByIds({ context, roomId, userId, personaIds }),
    ),
  )
}
