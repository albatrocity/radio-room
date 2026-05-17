import { PLATFORM_VIP_PERSONA_ID, type UserPersona } from "@repo/types"
import type { User } from "@repo/types/User"
import type { BridgeSnapshot } from "./types.js"

const VIP_PERSONA: UserPersona = {
  personaId: PLATFORM_VIP_PERSONA_ID,
  label: "VIP",
  icon: "Star",
  decoratesUser: true,
  decoratesChatMessage: true,
}

export function userHasVip(user: User): boolean {
  return !!user.personas?.some((p) => p.personaId === PLATFORM_VIP_PERSONA_ID)
}

export function toggleVipOnUser(user: User): User {
  if (userHasVip(user)) {
    const personas = user.personas?.filter((p) => p.personaId !== PLATFORM_VIP_PERSONA_ID)
    if (!personas?.length) {
      const { personas: _removed, ...rest } = user
      return rest
    }
    return { ...user, personas }
  }
  return { ...user, personas: [...(user.personas ?? []), VIP_PERSONA] }
}

export function applyUserUpdateToSnapshot(
  snap: BridgeSnapshot,
  userId: string,
  updater: (user: User) => User,
): { snap: BridgeSnapshot; user: User | null } {
  let updated: User | null = null
  const users = snap.users.map((u) => {
    if (u.userId !== userId) return u
    updated = updater(u)
    return updated
  })
  if (!updated) return { snap, user: null }
  return { snap: { ...snap, users }, user: updated }
}
