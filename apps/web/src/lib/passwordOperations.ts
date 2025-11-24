import { SESSION_PASSWORD } from "../constants"
import { AuthContext } from "../machines/authMachine"
import { AnyEventObject } from "xstate"

export const getPassword = () => {
  return sessionStorage.getItem(SESSION_PASSWORD)
}

export const savePassword = (_ctx: AuthContext, event: AnyEventObject) => {
  const password = event.data

  if (password) {
    sessionStorage.setItem(SESSION_PASSWORD, password)
  }
  return password
}
