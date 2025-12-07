import { setup, assign } from "xstate"
import { MetadataSourceType } from "../types/Queue"

const STORAGE_KEY = "metadata_preference"

interface Context {
  /** Available metadata sources for the current room */
  availableSources: MetadataSourceType[]
  /** User's preferred metadata source */
  preferredSource: MetadataSourceType | undefined
}

type MetadataPreferenceEvent =
  | { type: "SET_AVAILABLE_SOURCES"; sources: MetadataSourceType[] }
  | { type: "SET_PREFERRED_SOURCE"; source: MetadataSourceType }
  | { type: "CLEAR_PREFERENCE" }

/**
 * Metadata Preference Machine
 *
 * Manages user's preference for which metadata source to display track info from.
 * Persists preference to sessionStorage so it survives page reloads.
 */
export const metadataPreferenceMachine = setup({
  types: {
    context: {} as Context,
    events: {} as MetadataPreferenceEvent,
  },
  actions: {
    setAvailableSources: assign({
      availableSources: ({ event }) => {
        if (event.type !== "SET_AVAILABLE_SOURCES") return []
        return event.sources
      },
      // If current preference is not in new sources, reset to first source
      preferredSource: ({ context, event }) => {
        if (event.type !== "SET_AVAILABLE_SOURCES") return context.preferredSource
        const sources = event.sources
        if (context.preferredSource && sources.includes(context.preferredSource)) {
          return context.preferredSource
        }
        return sources[0]
      },
    }),
    setPreferredSource: assign({
      preferredSource: ({ event, context }) => {
        if (event.type !== "SET_PREFERRED_SOURCE") return context.preferredSource
        // Only allow setting if source is available
        if (!context.availableSources.includes(event.source)) {
          return context.preferredSource
        }
        return event.source
      },
    }),
    clearPreference: assign({
      preferredSource: ({ context }) => context.availableSources[0],
    }),
    persistPreference: ({ context }) => {
      if (context.preferredSource) {
        sessionStorage.setItem(STORAGE_KEY, context.preferredSource)
      } else {
        sessionStorage.removeItem(STORAGE_KEY)
      }
    },
    loadPreference: assign({
      preferredSource: ({ context }) => {
        const stored = sessionStorage.getItem(STORAGE_KEY) as MetadataSourceType | null
        // Only use stored preference if it's in available sources
        if (stored && context.availableSources.includes(stored)) {
          return stored
        }
        // Fall back to first available source
        return context.availableSources[0]
      },
    }),
  },
}).createMachine({
  id: "metadataPreference",
  context: {
    availableSources: [],
    preferredSource: undefined,
  },
  entry: ["loadPreference"],
  on: {
    SET_AVAILABLE_SOURCES: {
      actions: ["setAvailableSources", "loadPreference", "persistPreference"],
    },
    SET_PREFERRED_SOURCE: {
      actions: ["setPreferredSource", "persistPreference"],
    },
    CLEAR_PREFERENCE: {
      actions: ["clearPreference", "persistPreference"],
    },
  },
})

/**
 * Display names for metadata sources
 */
export const metadataSourceDisplayNames: Record<MetadataSourceType, string> = {
  spotify: "Spotify",
  tidal: "Tidal",
  applemusic: "Apple Music",
}

/**
 * Get icon name for a metadata source (for use with react-icons)
 */
export function getMetadataSourceIcon(source: MetadataSourceType): string {
  switch (source) {
    case "spotify":
      return "FaSpotify"
    case "tidal":
      return "SiTidal"
    case "applemusic":
      return "FaApple"
    default:
      return "FaMusic"
  }
}

