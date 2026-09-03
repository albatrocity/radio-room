import type { ChatMessage } from "../types/ChatMessage"
import type { User } from "../types/User"

type CacheEntry = {
  liveUser: User | undefined
  username: string | undefined
  usernameIcon: string | undefined
  displayUser: User
}

const cache = new WeakMap<ChatMessage, CacheEntry>()

/**
 * User to render for a chat row: live listener fields (status, personas) with
 * the baked presented-identity username/icon from the message (ADR 0150).
 *
 * The merge depends only on the live listener entry and the message's baked
 * username/icon, so the same object reference is returned until one of those
 * changes — `InnerItem` and `ChatMessage` both compare this prop by identity.
 */
export function chatDisplayUser(message: ChatMessage, liveUser: User | undefined): User {
  const { username, usernameIcon } = message.user
  const cached = cache.get(message)
  if (
    cached &&
    cached.liveUser === liveUser &&
    cached.username === username &&
    cached.usernameIcon === usernameIcon
  ) {
    return cached.displayUser
  }

  const displayUser = liveUser ? { ...liveUser, username, usernameIcon } : message.user
  cache.set(message, { liveUser, username, usernameIcon, displayUser })
  return displayUser
}
