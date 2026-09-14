/**
 * In-memory Lyric Hero stub for Game Studio / studio-bridge previews.
 * Enough to show the aboveChat card and accept submitGuess without the real plugin.
 */

type Mode = "competitive" | "inclusive" | "cooperative"

type PublicToken = { display: string; revealed: boolean }

type Puzzle = {
  tokens: PublicToken[]
  missedWords: string[]
  missesUsed: number
  missMax: number
  moodLabel: string
  walkedOut: boolean
  solved: boolean
  revealedPhrase?: string
}

type Session = {
  mode: Mode
  phraseIndex: number
  phraseTotal: number
  acceptingGuesses: boolean
  puzzle: Puzzle
  phrase: string
}

const sessions = new Map<string, Session>()

export const LYRIC_HERO_PREVIEW_PLUGIN = "lyric-hero"

const DEFAULT_PHRASE = "don't stop"

function blank(surface: string): string {
  return surface
    .split("")
    .map((ch) => (/[a-z0-9]/i.test(ch) ? "_" : ch))
    .join("")
}

function makePuzzle(phrase: string): Puzzle {
  const words = phrase.trim().split(/\s+/).filter(Boolean)
  return {
    tokens: words.map((w) => ({ display: blank(w), revealed: false })),
    missedWords: [],
    missesUsed: 0,
    missMax: 6,
    moodLabel: "locked in",
    walkedOut: false,
    solved: false,
  }
}

function storePayload(session: Session) {
  return {
    roundActive: true,
    mode: session.mode,
    phraseIndex: session.phraseIndex,
    phraseTotal: session.phraseTotal,
    acceptingGuesses: session.acceptingGuesses,
    puzzle: session.puzzle,
    leaderboard: [] as { score: number; value: string; username: string }[],
    statusMessage: `Phrase ${session.phraseIndex + 1} — guess a word`,
  }
}

function ensureSession(roomId: string, mode: Mode = "cooperative"): Session {
  const existing = sessions.get(roomId)
  if (existing) return existing
  const session: Session = {
    mode,
    phraseIndex: 0,
    phraseTotal: 1,
    acceptingGuesses: true,
    phrase: DEFAULT_PHRASE,
    puzzle: makePuzzle(DEFAULT_PHRASE),
  }
  sessions.set(roomId, session)
  return session
}

/** Late-joiner hydration for `GET .../plugins/lyric-hero/components`. */
export function buildStubLyricHeroComponentState(roomId: string): Record<string, unknown> {
  const session = sessions.get(roomId)
  if (!session) {
    return {
      roundActive: false,
      mode: null,
      phraseIndex: null,
      phraseTotal: 0,
      acceptingGuesses: false,
      puzzle: null,
      leaderboard: [],
      statusMessage: null,
    }
  }
  return storePayload(session)
}

/** `SESSION_STARTED` for optional `lyricPreview=1` handshake (mirrors quizPreview). */
export function buildStubLyricHeroSessionStarted(roomId: string): {
  type: string
  data: Record<string, unknown>
} {
  const session = ensureSession(roomId, "cooperative")
  return {
    type: "PLUGIN:lyric-hero:SESSION_STARTED",
    data: storePayload(session),
  }
}

export function runStubLyricHeroAction(
  roomId: string,
  action: string,
  params?: Record<string, unknown>,
): {
  success: boolean
  message?: string
  events: Array<{ type: string; data: Record<string, unknown> }>
} {
  const events: Array<{ type: string; data: Record<string, unknown> }> = []

  if (action === "startSession") {
    sessions.delete(roomId)
    const session = ensureSession(roomId, "cooperative")
    const data = storePayload(session)
    events.push({ type: "PLUGIN:lyric-hero:SESSION_STARTED", data })
    return { success: true, message: "Lyric Hero started (bridge stub).", events }
  }

  if (action === "endSession") {
    sessions.delete(roomId)
    events.push({
      type: "PLUGIN:lyric-hero:SESSION_ENDED",
      data: {
        roundActive: false,
        mode: null,
        phraseIndex: null,
        phraseTotal: 0,
        acceptingGuesses: false,
        puzzle: null,
        leaderboard: [],
        statusMessage: null,
      },
    })
    return { success: true, message: "Ended.", events }
  }

  if (action === "submitGuess") {
    const session = sessions.get(roomId)
    if (!session) {
      return { success: false, message: "No session. Start Lyric Hero first.", events }
    }
    const word = typeof params?.word === "string" ? params.word.trim().toLowerCase() : ""
    if (!word || word.includes(" ")) {
      return { success: false, message: "Guess one word.", events }
    }

    const phraseWords = session.phrase.toLowerCase().split(/\s+/)
    const hitIndexes = phraseWords
      .map((w, i) => (w.replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, "") === word ? i : -1))
      .filter((i) => i >= 0)

    if (hitIndexes.length > 0) {
      for (const i of hitIndexes) {
        const surface = session.phrase.split(/\s+/)[i]!
        session.puzzle.tokens[i] = { display: surface, revealed: true }
      }
      session.puzzle.solved = session.puzzle.tokens.every((t) => t.revealed)
      if (session.puzzle.solved) {
        session.acceptingGuesses = false
        session.puzzle.revealedPhrase = session.phrase
        session.puzzle.moodLabel = "locked in"
      }
    } else if (!session.puzzle.missedWords.includes(word)) {
      session.puzzle.missedWords.push(word)
      session.puzzle.missesUsed = session.puzzle.missedWords.length
      session.puzzle.moodLabel =
        session.puzzle.missesUsed >= 6
          ? "walking out"
          : session.puzzle.missesUsed >= 5
            ? "booing"
            : "restless"
      if (session.puzzle.missesUsed >= 6) {
        session.puzzle.walkedOut = true
        session.acceptingGuesses = false
        session.puzzle.revealedPhrase = session.phrase
        session.puzzle.tokens = session.phrase.split(/\s+/).map((w) => ({
          display: w,
          revealed: true,
        }))
      }
    }

    events.push({
      type: "PLUGIN:lyric-hero:PUZZLE_UPDATED",
      data: {
        puzzle: session.puzzle,
        acceptingGuesses: session.acceptingGuesses,
        statusMessage: storePayload(session).statusMessage,
      },
    })
    return { success: true, message: "Guess recorded (bridge stub).", events }
  }

  return { success: false, message: `Unknown lyric-hero action: ${action}`, events }
}
