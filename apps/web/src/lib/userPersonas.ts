import { PLATFORM_VIP_PERSONA_ID, type UserPersona } from "@repo/types"
import type { User } from "../types/User"

export function userHasPersona(user: User | undefined, personaId: string): boolean {
  return !!user?.personas?.some((p) => p.personaId === personaId)
}

export function userIsVip(user: User | undefined): boolean {
  return userHasPersona(user, PLATFORM_VIP_PERSONA_ID)
}

export function getUserPersona(
  user: User | undefined,
  personaId: string,
): UserPersona | undefined {
  return user?.personas?.find((p) => p.personaId === personaId)
}

export function getUserListPersonaBadges(user: User | undefined): UserPersona[] {
  return user?.personas?.filter((p) => p.decoratesUser) ?? []
}

export function getChatPersonaBadges(user: User | undefined): UserPersona[] {
  return user?.personas?.filter((p) => p.decoratesChatMessage) ?? []
}
