// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true
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
  eventsCausingActions: {
    addMessage: "NEW_MESSAGE"
    handleNotifications: "NEW_MESSAGE"
    sendMessage: "SUBMIT_MESSAGE"
    setCurrentUser: "SET_USERS"
    setData: "INIT" | "LOGIN"
    startTyping: "START_TYPING"
    stopTyping: "INIT" | "START_TYPING" | "STOP_TYPING"
  }
  eventsCausingServices: {}
  eventsCausingGuards: {}
  eventsCausingDelays: {}
  matchesStates:
    | "ready"
    | "ready.typing"
    | "ready.typing.active"
    | "ready.typing.inactive"
    | "unauthenticated"
    | { ready?: "typing" | { typing?: "active" | "inactive" } }
  tags: never
}
