import { FAMILY_PHOTO_DURATION_MS } from "./constants"

const PLACEHOLDER = "{originalMessage}"

export const SON_CHAT_FLAVOR_EARLY = [
  "Yeah, {originalMessage}!",
  "Like my dad always says, {originalMessage}",
  '"{originalMessage}" was something I heard a lot growing up',
  "My dad said it best: {originalMessage}",
  "That's so dad of him — {originalMessage}",
  "As the old man would say, {originalMessage}",
  'Heard this one at the dinner table: "{originalMessage}"',
  "Fatherly wisdom: {originalMessage}",
  "{originalMessage} — classic dad move",
  "I learned that from my dad: {originalMessage}",
  'Growing up it was always "{originalMessage}"',
  "Yeah dad, {originalMessage}",
  "Dad said: {originalMessage}",
  "House rule around here: {originalMessage}",
  'Taking notes: "{originalMessage}"',
  "I agree with the old man - {originalMessage}",
  "{originalMessage}, and that's final (according to dad)",
] as const

export const SON_CHAT_FLAVOR_MID = [
  "Ugh, dad again: {originalMessage}",
  "He says that every time — {originalMessage}",
  'Yeah yeah, "{originalMessage}"',
  "Dad's on repeat: {originalMessage}",
  'If I had a nickel for every "{originalMessage}"…',
  "Cool story, dad: {originalMessage}",
  "{originalMessage} — I've heard worse, but not by much",
  "Sure, dad. {originalMessage}",
  'There he goes: "{originalMessage}"',
  "Dad lecture #47: {originalMessage}",
  'We\'re all very proud of "{originalMessage}"',
  "Boomer energy: {originalMessage}",
  "Dad, please — {originalMessage}",
  "Not this again… {originalMessage}",
  "Eye roll. {originalMessage}",
  "Heard. Moving on. Also: {originalMessage}",
  "{originalMessage} — said like he's the first one to think of it",
] as const

export const SON_CHAT_FLAVOR_LATE = [
  "God, shut up",
  "Nobody asked, dad",
  "Embarrassing",
  "Can we not?",
  "Worst take in the room",
  "Dad's losing it",
  "Please stop talking",
  "I'd rather be anywhere else",
  "This is why I moved out",
  "Dad, you're killing me",
  "Hard pass",
  "Is he still talking?",
  "Delete that take",
  "Dad's so washed",
  "And somehow he thinks that's wisdom",
  "Someone mute him",
  "I regret being related",
] as const

export type SonChatFlavorStage = "early" | "mid" | "late"

/**
 * Pick the tone bank from remaining son lifetime.
 * early: remaining/total > 2/3; mid: > 1/3; late: otherwise.
 */
export function selectSonChatFlavorStage(
  remainingMs: number,
  totalMs: number = FAMILY_PHOTO_DURATION_MS,
): SonChatFlavorStage {
  const total = Math.max(1, totalMs)
  const fraction = Math.max(0, remainingMs) / total
  if (fraction > 2 / 3) return "early"
  if (fraction > 1 / 3) return "mid"
  return "late"
}

export function selectSonChatFlavorBank(
  remainingMs: number,
  totalMs: number = FAMILY_PHOTO_DURATION_MS,
): readonly string[] {
  const stage = selectSonChatFlavorStage(remainingMs, totalMs)
  if (stage === "early") return SON_CHAT_FLAVOR_EARLY
  if (stage === "mid") return SON_CHAT_FLAVOR_MID
  return SON_CHAT_FLAVOR_LATE
}

export function flavorSonChatMessage(
  content: string,
  opts?: {
    remainingMs?: number
    totalMs?: number
    random?: () => number
  },
): string {
  const totalMs = opts?.totalMs ?? FAMILY_PHOTO_DURATION_MS
  const remainingMs = opts?.remainingMs ?? totalMs
  const random = opts?.random ?? Math.random
  const bank = selectSonChatFlavorBank(remainingMs, totalMs)
  const index = Math.min(bank.length - 1, Math.max(0, Math.floor(random() * bank.length)))
  const template = bank[index] ?? bank[0]!
  return template.split(PLACEHOLDER).join(content)
}
