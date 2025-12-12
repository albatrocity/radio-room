import { setup, assign } from "xstate"
import { Howl } from "howler"
import { subscribeById, unsubscribeById } from "../actors/socketActor"
import { getVolume, isMuted } from "../actors/audioActor"

// ============================================================================
// Types
// ============================================================================

export interface SoundEffect {
  url: string
  volume: number
}

export interface SoundEffectsContext {
  queue: SoundEffect[]
  currentSound: Howl | null
  subscriptionId: string | null
}

type SoundEffectsEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | { type: "SOUND_EFFECT_QUEUED"; data: { url: string; volume: number } }
  | { type: "SOUND_ENDED" }
  | { type: "SOUND_ERROR" }

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

const defaultContext: SoundEffectsContext = {
  queue: [],
  currentSound: null,
  subscriptionId: null,
}

export const soundEffectsMachine = setup({
  types: {
    context: {} as SoundEffectsContext,
    events: {} as SoundEffectsEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `soundEffects-${self.id}-${++subscriptionCounter}`
      subscribeById(id, { send: (event) => self.send(event as SoundEffectsEvent) })
      return { subscriptionId: id }
    }),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    addToQueue: assign(({ context, event }) => {
      if (event.type !== "SOUND_EFFECT_QUEUED") return {}
      const newEffect: SoundEffect = {
        url: event.data.url,
        volume: event.data.volume,
      }
      return { queue: [...context.queue, newEffect] }
    }),
    playNextSound: assign(({ context, self }) => {
      if (context.queue.length === 0) {
        return { currentSound: null }
      }

      const [next, ...rest] = context.queue

      // Clean up previous sound if any
      if (context.currentSound) {
        context.currentSound.unload()
      }

      // Respect user's volume setting - sound effects should not exceed user volume
      // If user is muted, skip the sound effect entirely
      const userVolume = getVolume()
      const userMuted = isMuted()

      if (userMuted) {
        // Skip this sound and check if there are more in queue
        if (rest.length > 0) {
          self.send({ type: "SOUND_ENDED" })
        }
        return { queue: rest, currentSound: null }
      }

      // Cap the sound effect volume at the user's volume level
      const effectiveVolume = Math.min(next.volume, userVolume)

      // Create new Howl instance for the sound effect
      // Note: We intentionally don't use html5: true here.
      // Web Audio API mode allows multiple simultaneous sounds and
      // works better alongside the radio stream (which uses HTML5 Audio).
      const sound = new Howl({
        src: [next.url],
        volume: effectiveVolume,
        onend: () => {
          self.send({ type: "SOUND_ENDED" })
        },
        onloaderror: () => {
          console.error("[SoundEffects] Failed to load sound:", next.url)
          self.send({ type: "SOUND_ERROR" })
        },
        onplayerror: () => {
          console.error("[SoundEffects] Failed to play sound:", next.url)
          self.send({ type: "SOUND_ERROR" })
        },
      })

      sound.play()

      return {
        queue: rest,
        currentSound: sound,
      }
    }),
    stopCurrentSound: ({ context }) => {
      if (context.currentSound) {
        context.currentSound.stop()
        context.currentSound.unload()
      }
    },
    resetSoundEffects: assign(({ context }) => {
      // Clean up current sound if playing
      if (context.currentSound) {
        context.currentSound.stop()
        context.currentSound.unload()
      }
      return defaultContext
    }),
  },
  guards: {
    hasQueuedSounds: ({ context }) => context.queue.length > 0,
    queueIsEmpty: ({ context }) => context.queue.length === 0,
  },
}).createMachine({
  id: "soundEffects",
  initial: "idle",
  context: defaultContext,
  states: {
    // Idle state - not subscribed to socket events (not in a room)
    idle: {
      on: {
        ACTIVATE: "active",
      },
    },
    // Active state - subscribed to socket events
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe", "resetSoundEffects"],
      on: {
        DEACTIVATE: {
          target: "idle",
        },
      },
      initial: "waiting",
      states: {
        // Waiting for sound effects to be queued
        waiting: {
          on: {
            SOUND_EFFECT_QUEUED: {
              target: "playing",
              actions: ["addToQueue", "playNextSound"],
            },
          },
        },
        // Playing a sound effect
        playing: {
          on: {
            SOUND_EFFECT_QUEUED: {
              actions: ["addToQueue"],
            },
            SOUND_ENDED: [
              {
                target: "playing",
                guard: "hasQueuedSounds",
                actions: ["playNextSound"],
              },
              {
                target: "waiting",
              },
            ],
            SOUND_ERROR: [
              {
                target: "playing",
                guard: "hasQueuedSounds",
                actions: ["playNextSound"],
              },
              {
                target: "waiting",
              },
            ],
          },
        },
      },
    },
  },
})
