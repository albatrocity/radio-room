// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true
  internalEvents: {
    "xstate.init": { type: "xstate.init" }
  }
  invokeSrcNameMap: {}
  missingImplementations: {
    actions: never
    delays: never
    guards: never
    services: "socket"
  }
  eventsCausingActions: {
    addMessage: "NEW_MESSAGE"
    clearMessages: "CLEAR_MESSAGES"
    handleNotifications: "NEW_MESSAGE"
    sendMessage: "SUBMIT_MESSAGE"
    setCurrentUser: "SET_USERS"
    setData: "INIT" | "LOGIN" | "SET_MESSAGES"
    startTyping: "START_TYPING"
    stopTyping: "INIT" | "START_TYPING" | "STOP_TYPING"
  }
  eventsCausingDelays: {}
  eventsCausingGuards: {}
  eventsCausingServices: {
    socket: "xstate.init"
  }
  matchesStates:
    | "ready"
    | "ready.typing"
    | "ready.typing.active"
    | "ready.typing.inactive"
    | "unauthenticated"
    | { ready?: "typing" | { typing?: "active" | "inactive" } }
  tags: never
}
