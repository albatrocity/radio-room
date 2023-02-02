// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true
  internalEvents: {
    "done.invoke.getStoredPassword": {
      type: "done.invoke.getStoredPassword"
      data: unknown
      __tip: "See the XState TS docs to learn how to strongly type this."
    }
    "done.invoke.getStoredUser": {
      type: "done.invoke.getStoredUser"
      data: unknown
      __tip: "See the XState TS docs to learn how to strongly type this."
    }
    "done.invoke.setStoredUser": {
      type: "done.invoke.setStoredUser"
      data: unknown
      __tip: "See the XState TS docs to learn how to strongly type this."
    }
    "error.platform.getStoredPassword": {
      type: "error.platform.getStoredPassword"
      data: unknown
    }
    "error.platform.getStoredUser": {
      type: "error.platform.getStoredUser"
      data: unknown
    }
    "error.platform.setStoredUser": {
      type: "error.platform.setStoredUser"
      data: unknown
    }
    "xstate.after(3000)#auth.connecting": {
      type: "xstate.after(3000)#auth.connecting"
    }
    "xstate.init": { type: "xstate.init" }
  }
  invokeSrcNameMap: {}
  missingImplementations: {
    actions: never
    delays: never
    guards: never
    services: "getStoredPassword" | "getStoredUser" | "setStoredUser" | "socket"
  }
  eventsCausingActions: {
    activateAdmin: "ACTIVATE_ADMIN"
    changeUsername: "UPDATE_USERNAME"
    checkPasswordRequirement:
      | "error.platform.getStoredPassword"
      | "error.platform.getStoredUser"
      | "error.platform.setStoredUser"
      | "xstate.init"
    disableRetry: "KICKED"
    disconnectUser: "KICKED" | "USER_DISCONNECTED" | "disconnect"
    getStoredPassword:
      | "error.platform.getStoredPassword"
      | "error.platform.getStoredUser"
      | "error.platform.setStoredUser"
      | "xstate.init"
    kickUser: "KICK_USER"
    login:
      | "SETUP"
      | "done.invoke.getStoredUser"
      | "xstate.after(3000)#auth.connecting"
    savePassword: "SET_PASSWORD"
    saveUser: "ACTIVATE_ADMIN"
    setCurrentUser: "done.invoke.getStoredUser" | "done.invoke.setStoredUser"
    setPasswordError: "SET_PASSWORD_ACCEPTED"
    submitPassword: "SET_PASSWORD"
    unsetNew: "UPDATE_USERNAME"
    updateUsername: "UPDATE_USERNAME"
  }
  eventsCausingDelays: {}
  eventsCausingGuards: {
    isAdmin: "KICK_USER"
    passwordAccepted: "SET_PASSWORD_ACCEPTED" | "SET_PASSWORD_REQUIREMENT"
    passwordRejected: "SET_PASSWORD_ACCEPTED"
    requiresPassword: "SET_PASSWORD_REQUIREMENT"
    shouldNotRetry: "USER_DISCONNECTED"
    shouldRetry: "always"
  }
  eventsCausingServices: {
    getStoredPassword: never
    getStoredUser:
      | "SETUP"
      | "SET_PASSWORD_ACCEPTED"
      | "SET_PASSWORD_REQUIREMENT"
      | "always"
      | "done.invoke.getStoredPassword"
    setStoredUser: "UPDATE_USERNAME"
    socket: "xstate.init"
  }
  matchesStates:
    | "authenticated"
    | "authorizing"
    | "connecting"
    | "disconnected"
    | "initiated"
    | "unauthenticated"
    | "unauthorized"
    | "updating"
  tags: never
}
