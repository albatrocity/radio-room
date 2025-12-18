import { randomUUID } from "crypto"

const adjectives = [
  "Happy",
  "Cosmic",
  "Electric",
  "Funky",
  "Groovy",
  "Jazzy",
  "Mellow",
  "Retro",
  "Smooth",
  "Velvet",
  "Neon",
  "Atomic",
  "Crystal",
  "Digital",
  "Lunar",
]

const nouns = [
  "Dancer",
  "Dreamer",
  "Explorer",
  "Listener",
  "Voyager",
  "Wanderer",
  "Surfer",
  "Rider",
  "Seeker",
  "Drifter",
  "Chaser",
  "Spinner",
  "Viber",
  "Groover",
  "Bopper",
]

const messageTemplates = [
  "Great song! 🎵",
  "Love this track!",
  "Who added this? Fire! 🔥",
  "This is a banger!",
  "Vibing to this",
  "Classic tune",
  "Adding this to my playlist",
  "First time hearing this, love it!",
  "🎶",
  "💃",
  "This slaps",
  "Good choice!",
  "Haven't heard this in ages",
  "Solid pick",
  "The bass on this 👌",
]

export function randomUsername(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(Math.random() * 100)
  return `${adj}${noun}${num}`
}

export function randomUserId(): string {
  return `loadtest-${randomUUID()}`
}

export function randomMessage(customMessages?: string[]): string {
  const messages = customMessages?.length ? customMessages : messageTemplates
  return messages[Math.floor(Math.random() * messages.length)]
}

export function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Distribute N actions over a duration with a specific pattern
 */
export function calculateActionTimes(
  count: number,
  durationMs: number,
  pattern: "even" | "random" | "burst" = "even"
): number[] {
  const times: number[] = []

  switch (pattern) {
    case "even":
      // Evenly distributed
      const interval = durationMs / count
      for (let i = 0; i < count; i++) {
        times.push(Math.floor(i * interval))
      }
      break

    case "random":
      // Randomly distributed
      for (let i = 0; i < count; i++) {
        times.push(Math.floor(Math.random() * durationMs))
      }
      times.sort((a, b) => a - b)
      break

    case "burst":
      // First 20% of time, 80% of actions
      const burstPhase = durationMs * 0.2
      const burstCount = Math.floor(count * 0.8)
      const remainingCount = count - burstCount

      for (let i = 0; i < burstCount; i++) {
        times.push(Math.floor(Math.random() * burstPhase))
      }
      for (let i = 0; i < remainingCount; i++) {
        times.push(Math.floor(burstPhase + Math.random() * (durationMs - burstPhase)))
      }
      times.sort((a, b) => a - b)
      break
  }

  return times
}

