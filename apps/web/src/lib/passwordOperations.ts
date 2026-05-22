import { AuthContext } from "../machines/authMachine"
import { AnyEventObject } from "xstate"
import { getStoredPassword, setStoredPassword } from "./clientSession"

export const getPassword = () => {
  return getStoredPassword()
}

export const savePassword = (_ctx: AuthContext, event: AnyEventObject) => {
  const password = event.data

  if (password) {
    setStoredPassword(password)
  }
  return password
}
