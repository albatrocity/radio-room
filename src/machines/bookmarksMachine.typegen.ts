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
    toggleItem: "TOGGLE_ITEM"
  }
  eventsCausingDelays: {}
  eventsCausingGuards: {}
  eventsCausingServices: {
    socket: "xstate.init"
  }
  matchesStates: "ready"
  tags: never
}
