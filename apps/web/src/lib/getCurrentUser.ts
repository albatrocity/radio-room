import {
  SESSION_ID,
  SESSION_USERNAME,
  SESSION_PASSWORD,
  SESSION_ADMIN,
} from "../constants"
import { AuthContext } from "../machines/authMachine"

export function getCurrentUser(un?: string) {
  const storedId = sessionStorage.getItem(SESSION_ID)
  const isNewUser = !storedId
  // Convert null to undefined for consistency
  const userId = storedId || undefined
  const isAdmin = sessionStorage.getItem(SESSION_ADMIN) === "true"

  const storedUsername = sessionStorage.getItem(SESSION_USERNAME)
  const username = un ?? (storedUsername || undefined)
  const storedPassword = sessionStorage.getItem(SESSION_PASSWORD)
  const password = storedPassword || undefined

  return {
    currentUser: { username, userId, password, isAdmin },
    isNewUser: isNewUser,
    isAdmin,
    password,
  }
}

export function saveCurrentUser({
  currentUser,
}: Pick<AuthContext, "currentUser">) {
  const userId = currentUser?.userId ?? sessionStorage.getItem(SESSION_ID)
  if (userId) {
    sessionStorage.setItem(SESSION_USERNAME, currentUser?.username ?? "")
    sessionStorage.setItem(SESSION_ID, userId)
  }

  return {
    currentUser: { username: currentUser?.username, userId },
    isAdmin: currentUser?.isAdmin,
    isNewUser: false,
  }
}

export function clearCurrentUser() {
  sessionStorage.removeItem(SESSION_USERNAME)
  sessionStorage.removeItem(SESSION_ID)
}
