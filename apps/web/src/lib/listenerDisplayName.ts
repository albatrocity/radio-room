import { getUserById } from "../actors/usersActor"

/** Display name for a listener id; `fallback` is used when the user is unknown. */
export function displayNameForUserId(userId: string, fallback = "Someone"): string {
  return getUserById(userId)?.username?.trim() || fallback
}

export function counterpartyLabel(userId: string, me: string | undefined): string {
  if (userId === me) return "you"
  return displayNameForUserId(userId)
}
