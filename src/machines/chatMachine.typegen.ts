// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true
  eventsCausingActions: {
    setData: "LOGIN" | "INIT"
    sendMessage: "SUBMIT_MESSAGE"
    addMessage: "NEW_MESSAGE"
    handleNotifications: "NEW_MESSAGE"
    setCurrentUser: "SET_USERS"
    stopTyping: "INIT" | "STOP_TYPING"
    startTyping: "START_TYPING"
  }
  internalEvents: {
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
  eventsCausingGuards: {}
  eventsCausingDelays: {}
  matchesStates:
    | "unauthenticated"
    | "ready"
    | "ready.typing"
    | "ready.typing.active"
    | "ready.typing.inactive"
    | { ready?: "typing" | { typing?: "active" | "inactive" } }
  tags: never
}
