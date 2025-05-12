import session from "sessionstorage"

import { SESSION_PASSWORD } from "../constants"
import { AuthContext } from "../machines/authMachine"
import { AnyEventObject } from "xstate"

export const getPassword = () => {
  return session.getItem(SESSION_PASSWORD)
}

export const savePassword = (_ctx: AuthContext, event: AnyEventObject) => {
  const password = event.data || session.setItem(SESSION_PASSWORD)

  session.setItem(SESSION_PASSWORD, password)
  return password
}
