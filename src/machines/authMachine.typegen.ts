// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true
  eventsCausingActions: {
    setCurrentUser: "done.invoke.getStoredUser" | "done.invoke.setStoredUser"
    disconnectUser: "USER_DISCONNECTED" | "disconnect" | "KICKED"
    unsetNew: "UPDATE_USERNAME"
    updateUsername: "UPDATE_USERNAME"
    changeUsername: "UPDATE_USERNAME"
    activateAdmin: "ACTIVATE_ADMIN"
    saveUser: "ACTIVATE_ADMIN"
    kickUser: "KICK_USER"
    disableRetry: "KICKED"
    savePassword: "SET_PASSWORD"
    submitPassword: "SET_PASSWORD"
    setPasswordError: "SET_PASSWORD_ACCEPTED"
    getStoredPassword:
      | "error.platform.getStoredUser"
      | "error.platform.setStoredUser"
      | "error.platform.getStoredPassword"
    checkPasswordRequirement:
      | "error.platform.getStoredUser"
      | "error.platform.setStoredUser"
      | "error.platform.getStoredPassword"
    login:
      | "done.invoke.getStoredUser"
      | "xstate.after(3000)#auth.connecting"
      | "SETUP"
  }
  internalEvents: {
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
    "error.platform.getStoredUser": {
      type: "error.platform.getStoredUser"
      data: unknown
    }
    "error.platform.setStoredUser": {
      type: "error.platform.setStoredUser"
      data: unknown
    }
    "error.platform.getStoredPassword": {
      type: "error.platform.getStoredPassword"
      data: unknown
    }
    "xstate.after(3000)#auth.connecting": {
      type: "xstate.after(3000)#auth.connecting"
    }
    "": { type: "" }
    "done.invoke.getStoredPassword": {
      type: "done.invoke.getStoredPassword"
      data: unknown
      __tip: "See the XState TS docs to learn how to strongly type this."
    }
    "xstate.init": { type: "xstate.init" }
  }
  invokeSrcNameMap: {}
  missingImplementations: {
    actions: never
    services: never
    guards: never
    delays: never
  }
  eventsCausingServices: {}
  eventsCausingGuards: {
    passwordAccepted: "SET_PASSWORD_REQUIREMENT" | "SET_PASSWORD_ACCEPTED"
    requiresPassword: "SET_PASSWORD_REQUIREMENT"
    shouldRetry: ""
    shouldNotRetry: "USER_DISCONNECTED"
    isAdmin: "KICK_USER"
    passwordRejected: "SET_PASSWORD_ACCEPTED"
  }
  eventsCausingDelays: {}
  matchesStates:
    | "unauthenticated"
    | "disconnected"
    | "initiated"
    | "updating"
    | "connecting"
    | "authenticated"
    | "authorizing"
    | "unauthorized"
  tags: never
}
