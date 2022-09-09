import session from "sessionstorage"

import { SESSION_PASSWORD } from "../constants"

export const getPassword = (_ctx: {}, _event: {}) => {
  return session.getItem(SESSION_PASSWORD)
}

export const savePassword = (_ctx: {}, event: { data: {} }) => {
  const password = event.data || session.setItem(SESSION_PASSWORD)

  session.setItem(SESSION_PASSWORD, password)
  return password
}
