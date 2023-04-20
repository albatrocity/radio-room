import session from "sessionstorage"
import { v4 as uuidv4 } from "uuid"

import generateAnonName from "./generateAnonName"
import {
  SESSION_ID,
  SESSION_USERNAME,
  SESSION_PASSWORD,
  SESSION_ADMIN,
} from "../constants"
import { AuthContext } from "../machines/authMachine"

export function getCurrentUser(un?: string) {
  const isNewUser = !session.getItem(SESSION_ID)
  const userId = session.getItem(SESSION_ID) || uuidv4()
  const isAdmin = session.getItem(SESSION_ADMIN) === "true"

  const username = un || session.getItem(SESSION_USERNAME) || generateAnonName()
  const password = session.getItem(SESSION_PASSWORD)

  session.setItem(SESSION_USERNAME, username)
  session.setItem(SESSION_ID, userId)
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
  const userId = session.getItem(SESSION_ID)
  session.setItem(SESSION_USERNAME, currentUser?.username)
  if (currentUser?.isAdmin) {
    session.setItem(SESSION_ADMIN, true)
  }

  return {
    currentUser: { username: currentUser?.username, userId },
    isAdmin: currentUser?.isAdmin,
    isNewUser: false,
  }
}
