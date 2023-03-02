// This file was automatically generated. Edits will be overwritten

export interface Typegen0 {
  "@@xstate/typegen": true
  internalEvents: {
    "error.platform.socket": { type: "error.platform.socket"; data: unknown }
    "xstate.after(2000)#audio.willRetry": {
      type: "xstate.after(2000)#audio.willRetry"
    }
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
    setMeta: "INIT" | "META"
    setVolume: "CHANGE_VOLUME"
    startListening: "META" | "TOGGLE"
    stopListening:
      | "INIT"
      | "META"
      | "ONLINE"
      | "TOGGLE"
      | "xstate.after(2000)#audio.willRetry"
  }
  eventsCausingDelays: {}
  eventsCausingGuards: {
    hasBitrate: "INIT" | "META"
    volumeAboveZero: "CHANGE_VOLUME"
    volumeIsZero: "CHANGE_VOLUME"
  }
  eventsCausingServices: {
    socket: "error.platform.socket" | "xstate.init"
  }
  matchesStates:
    | "offline"
    | "online"
    | "online.cover"
    | "online.cover.found"
    | "online.cover.none"
    | "online.progress"
    | "online.progress.playing"
    | "online.progress.stopped"
    | "online.volume"
    | "online.volume.muted"
    | "online.volume.unmuted"
    | "willRetry"
    | {
        online?:
          | "cover"
          | "progress"
          | "volume"
          | {
              cover?: "found" | "none"
              progress?: "playing" | "stopped"
              volume?: "muted" | "unmuted"
            }
      }
  tags: never
}
