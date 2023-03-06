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
    services: never
  }
  eventsCausingActions: {
    clear: "CLEAR"
    enablePersistence: "ENABLE_PERSISTENCE"
    loadCollection: "xstate.init"
    persist: "TOGGLE_MESSAGE"
    setName: "SET_NAME"
    toggleItem: "TOGGLE_ITEM" | "TOGGLE_MESSAGE"
  }
  eventsCausingDelays: {}
  eventsCausingGuards: {}
  eventsCausingServices: {}
  matchesStates: "ready"
  tags: never
}
