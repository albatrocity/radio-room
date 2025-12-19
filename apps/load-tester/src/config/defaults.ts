import type { ScenarioConfig } from "./schema.js"

export const DEFAULT_TARGET = "http://localhost:3000"
export const DEFAULT_ROOM_ID = "test-room"
export const DEFAULT_USER_COUNT = 5
export const DEFAULT_DURATION = 60 // seconds
export const DEFAULT_JOIN_DURATION = 10 // seconds

export const DEFAULT_EMOJIS = [
  { id: "thumbsup", name: "thumbs up", native: "👍", shortcodes: ":+1:", keywords: ["thumbsup", "yes", "awesome", "good"] },
  { id: "heart", name: "red heart", native: "❤️", shortcodes: ":heart:", keywords: ["love", "like"] },
  { id: "fire", name: "fire", native: "🔥", shortcodes: ":fire:", keywords: ["hot", "burn", "lit"] },
  { id: "joy", name: "face with tears of joy", native: "😂", shortcodes: ":joy:", keywords: ["haha", "lol"] },
  { id: "musical_note", name: "musical note", native: "🎵", shortcodes: ":musical_note:", keywords: ["music", "song"] },
  { id: "clap", name: "clapping hands", native: "👏", shortcodes: ":clap:", keywords: ["applause", "bravo"] },
  { id: "sparkles", name: "sparkles", native: "✨", shortcodes: ":sparkles:", keywords: ["magic", "shine"] },
  { id: "rocket", name: "rocket", native: "🚀", shortcodes: ":rocket:", keywords: ["launch", "blast"] },
]

export const DEFAULT_TRACK_IDS = [
  "4iV5W9uYEdYUVa79Axb7Rh", // Spotify track ID example
  "1301WleyT98MSxVHPZCA6M",
  "3n3Ppam7vgaVa1iaRUc9Lp",
]

export const DEFAULT_MESSAGES = [
  "Great song! 🎵",
  "Love this track!",
  "🔥🔥🔥",
  "Who added this?",
  "Vibing hard",
  "Classic!",
  "This slaps",
  "Good pick!",
  "💃",
  "Turn it up!",
]

export function createDefaultScenario(overrides?: Partial<ScenarioConfig>): ScenarioConfig {
  return {
    name: "default-test",
    target: DEFAULT_TARGET,
    roomId: DEFAULT_ROOM_ID,
    duration: DEFAULT_DURATION,
    verbose: false,
    users: {
      count: DEFAULT_USER_COUNT,
      joinPattern: "staggered",
      joinDuration: DEFAULT_JOIN_DURATION,
      leaveAfterActions: false,
    },
    actions: {
      sendMessages: {
        enabled: true,
        messagesPerUser: 3,
        content: DEFAULT_MESSAGES,
        distribution: "random",
      },
    },
    ...overrides,
  }
}

