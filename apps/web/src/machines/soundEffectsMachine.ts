import { setup, assign } from "xstate"
import { subscribeById, unsubscribeById } from "../actors/socketActor"
import { audioActor, getVolume, isMuted } from "../actors/audioActor"
import { areSoundEffectsEnabled } from "../actors/soundEffectsPreferenceActor"

// ============================================================================
// Types
// ============================================================================

export interface SoundEffect {
  url: string
  volume: number
  /** When true, duck programme while this clip plays (ADR 0174). */
  duck?: boolean
}

export interface SoundEffectsContext {
  queue: SoundEffect[]
  /** Native element — avoids Howler's global `crossOrigin=anonymous` patch (CDN SFX). */
  currentSound: HTMLAudioElement | null
  subscriptionId: string | null
}

type SoundEffectsEvent =
  | { type: "ACTIVATE" }
  | { type: "DEACTIVATE" }
  | {
      type: "SOUND_EFFECT_QUEUED"
      data: { url: string; volume: number; duck?: boolean }
    }
  | { type: "SOUND_ENDED" }
  | { type: "SOUND_ERROR" }
  | { type: "FLUSH" }

// ============================================================================
// Machine
// ============================================================================

let subscriptionCounter = 0

const defaultContext: SoundEffectsContext = {
  queue: [],
  currentSound: null,
  subscriptionId: null,
}

function stopAndClear(audio: HTMLAudioElement | null) {
  if (!audio) return
  try {
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
  } catch {
    /* ignore */
  }
}

function clearSfxDuck() {
  audioActor.send({ type: "CLEAR_DUCK", source: "sfx" })
}

function setSfxDuck() {
  audioActor.send({ type: "SET_DUCK", source: "sfx" })
}

export const soundEffectsMachine = setup({
  types: {
    context: {} as SoundEffectsContext,
    events: {} as SoundEffectsEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `soundEffects-${self.id}-${++subscriptionCounter}`
      subscribeById(id, {
        send: (event) => self.send(event as SoundEffectsEvent),
        eventTypes: ["SOUND_EFFECT_QUEUED"],
      })
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
        ...(event.data.duck === true ? { duck: true } : {}),
      }
      return { queue: [...context.queue, newEffect] }
    }),
    playNextSound: assign(({ context, self }) => {
      if (context.queue.length === 0) {
        clearSfxDuck()
        return { currentSound: null }
      }

      // Preference off: do not play or duck (belt-and-suspenders next to the guard).
      if (!areSoundEffectsEnabled()) {
        clearSfxDuck()
        stopAndClear(context.currentSound)
        return { queue: [], currentSound: null }
      }

      const [next, ...rest] = context.queue
      stopAndClear(context.currentSound)

      const userVolume = getVolume()
      const userMuted = isMuted()

      if (userMuted) {
        clearSfxDuck()
        if (rest.length > 0) {
          self.send({ type: "SOUND_ENDED" })
        }
        return { queue: rest, currentSound: null }
      }

      if (next.duck) {
        setSfxDuck()
      } else {
        clearSfxDuck()
      }

      // Cap SFX at the user's volume. Do NOT set crossOrigin — Howler's global
      // HTML5 CORS patch (anonymous) breaks CDN hosts without ACAO (ADR 0173).
      const effectiveVolume = Math.min(next.volume, userVolume)
      const audio = new Audio(next.url)
      audio.volume = Math.max(0, Math.min(1, effectiveVolume))
      audio.addEventListener("ended", () => {
        self.send({ type: "SOUND_ENDED" })
      })
      audio.addEventListener("error", () => {
        console.error("[SoundEffects] Failed to load/play sound:", next.url)
        self.send({ type: "SOUND_ERROR" })
      })

      void audio.play().catch((err) => {
        console.error("[SoundEffects] play() rejected (autoplay/unlock?):", next.url, err)
        self.send({ type: "SOUND_ERROR" })
      })

      return {
        queue: rest,
        currentSound: audio,
      }
    }),
    stopCurrentSound: ({ context }) => {
      stopAndClear(context.currentSound)
    },
    clearSfxDuckAction: () => {
      clearSfxDuck()
    },
    /** Stop in-flight clip, empty queue, clear duck — keep socket subscription. */
    flushPlayback: assign(({ context }) => {
      stopAndClear(context.currentSound)
      clearSfxDuck()
      return { queue: [], currentSound: null }
    }),
    resetSoundEffects: assign(({ context }) => {
      stopAndClear(context.currentSound)
      clearSfxDuck()
      return defaultContext
    }),
  },
  guards: {
    hasQueuedSounds: ({ context }) => context.queue.length > 0,
    queueIsEmpty: ({ context }) => context.queue.length === 0,
    soundEffectsEnabled: () => areSoundEffectsEnabled(),
  },
}).createMachine({
  id: "soundEffects",
  initial: "idle",
  context: defaultContext,
  states: {
    idle: {
      on: {
        ACTIVATE: "active",
        FLUSH: {
          actions: ["flushPlayback"],
        },
      },
    },
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
        waiting: {
          entry: ["clearSfxDuckAction"],
          on: {
            SOUND_EFFECT_QUEUED: {
              target: "playing",
              guard: "soundEffectsEnabled",
              actions: ["addToQueue", "playNextSound"],
            },
            FLUSH: {
              actions: ["flushPlayback"],
            },
          },
        },
        playing: {
          on: {
            SOUND_EFFECT_QUEUED: {
              guard: "soundEffectsEnabled",
              actions: ["addToQueue"],
            },
            FLUSH: {
              target: "waiting",
              actions: ["flushPlayback"],
            },
            SOUND_ENDED: [
              {
                target: "playing",
                guard: "hasQueuedSounds",
                actions: ["playNextSound"],
              },
              {
                target: "waiting",
                actions: ["clearSfxDuckAction"],
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
                actions: ["clearSfxDuckAction"],
              },
            ],
          },
        },
      },
    },
  },
})
