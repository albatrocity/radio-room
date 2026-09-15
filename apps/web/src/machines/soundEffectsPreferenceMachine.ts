import { setup, assign } from "xstate"

interface Context {
  enabled: boolean
}

type SoundEffectsPreferenceEvent =
  | { type: "SET_SOUND_EFFECTS_ENABLED"; value: boolean }
  | { type: "TOGGLE_SOUND_EFFECTS_ENABLED" }

export const SOUND_EFFECTS_ENABLED_STORAGE_KEY = "soundEffectsEnabled"

export const soundEffectsPreferenceMachine = setup({
  types: {
    context: {} as Context,
    events: {} as SoundEffectsPreferenceEvent,
  },
  actions: {
    setEnabled: assign({
      enabled: ({ event }) => {
        if (event.type === "SET_SOUND_EFFECTS_ENABLED") {
          return event.value
        }
        return true
      },
    }),
    toggleEnabled: assign({
      enabled: ({ context }) => !context.enabled,
    }),
    persistEnabled: ({ context }) => {
      sessionStorage.setItem(
        SOUND_EFFECTS_ENABLED_STORAGE_KEY,
        JSON.stringify(context.enabled),
      )
    },
    loadEnabled: assign({
      enabled: () => {
        const stored = sessionStorage.getItem(SOUND_EFFECTS_ENABLED_STORAGE_KEY)
        return stored ? JSON.parse(stored) : true
      },
    }),
  },
}).createMachine({
  id: "soundEffectsPreference",
  context: {
    enabled: true,
  },
  entry: ["loadEnabled"],
  on: {
    SET_SOUND_EFFECTS_ENABLED: {
      actions: ["setEnabled", "persistEnabled"],
    },
    TOGGLE_SOUND_EFFECTS_ENABLED: {
      actions: ["toggleEnabled", "persistEnabled"],
    },
  },
})
