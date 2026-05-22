import { AuthContext } from "../machines/authMachine"
import {
  clearStoredUser,
  getStoredIsAdmin,
  getStoredPassword,
  getStoredUserId,
  getStoredUsername,
  setStoredUserId,
  setStoredUsername,
} from "./clientSession"

export function getCurrentUser(un?: string) {
  const userId = getStoredUserId() ?? undefined
  const isAdmin = getStoredIsAdmin()
  const username = un ?? (getStoredUsername() ?? undefined)
  const password = getStoredPassword() ?? undefined

  return {
    currentUser: { username, userId, password, isAdmin },
    isNewUser: !userId,
    isAdmin,
    password,
  }
}

export function saveCurrentUser({
  currentUser,
}: Pick<AuthContext, "currentUser">) {
  const userId = currentUser?.userId ?? getStoredUserId() ?? undefined
  if (userId) {
    setStoredUsername(currentUser?.username ?? "")
    setStoredUserId(userId)
  }

  return {
    currentUser: { username: currentUser?.username, userId },
    isAdmin: currentUser?.isAdmin,
    isNewUser: false,
  }
}

export function clearCurrentUser() {
  clearStoredUser()
}
