import session from "sessionstorage"
import { v4 as uuidv4 } from "uuid"

import generateAnonName from "./generateAnonName"
import { SESSION_ID, SESSION_USERNAME, SESSION_PASSWORD } from "../constants"

export const getCurrentUser = un => {
  const isNewUser = !session.getItem(SESSION_ID)
  const userId = session.getItem(SESSION_ID) || uuidv4()
  const username = un || session.getItem(SESSION_USERNAME) || generateAnonName()
  const password = session.getItem(SESSION_PASSWORD)

  session.setItem(SESSION_USERNAME, username)
  session.setItem(SESSION_ID, userId)
  return {
    currentUser: { username, userId, password },
    isNewUser: isNewUser,
    password,
  }
}
