import {
  SESSION_ID,
  SESSION_USERNAME,
  SESSION_PASSWORD,
  SESSION_ADMIN,
} from "../constants"
import { AuthContext } from "../machines/authMachine"

export function getCurrentUser(un?: string) {
  const isNewUser = !sessionStorage.getItem(SESSION_ID)
  const userId = sessionStorage.getItem(SESSION_ID)
  const isAdmin = sessionStorage.getItem(SESSION_ADMIN) === "true"

  const username = un ?? sessionStorage.getItem(SESSION_USERNAME)
  const password = sessionStorage.getItem(SESSION_PASSWORD)

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
