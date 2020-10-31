import session from "sessionstorage"
import { v4 as uuidv4 } from "uuid"

import { SESSION_PASSWORD } from "../constants"

export const getPassword = (ctx, event) => {
  return session.getItem(SESSION_PASSWORD)
}

export const savePassword = (ctx, event) => {
  const password = event.data || session.setItem(SESSION_PASSWORD)

  session.setItem(SESSION_PASSWORD, password)
  return password
}
