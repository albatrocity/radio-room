/**
 * Quiz Sessions preview stubs for Game Studio → Listening Room.
 *
 * The bridge does not run the real `@repo/plugin-quiz-sessions` plugin, so it
 * fakes the Phase 6 store-key contract (`activeQuestion`, `leaderboard`,
 * `lastCorrectAnswer`) well enough to render the `quiz-question-card` above chat
 * and the leaderboard game-state tab. `getComponentState` hydration reads from a
 * per-room in-memory session; the admin session-control buttons
 * (`EXECUTE_PLUGIN_ACTION`) drive it and emit `PLUGIN:quiz-sessions:*` events.
 */

export const QUIZ_PREVIEW_PLUGIN = "quiz-sessions"

interface StubQuestion {
  id: string
  text: string
  /** Revealed after correct/advance in a PvP-style preview. */
  answer: string
}

const STUB_QUESTIONS: StubQuestion[] = [
  { id: "quiz-q1", text: "Which band released 'Blue Monday'?", answer: "New Order" },
  { id: "quiz-q2", text: "What decade was 'Blue Monday' released in?", answer: "1980s" },
  { id: "quiz-q3", text: "Which label released 'Blue Monday'?", answer: "Factory Records" },
]

const STUB_LEADERBOARD = [
  { score: 3, value: "studio-guest-ada", username: "Ada" },
  { score: 2, value: "studio-guest-grace", username: "Grace" },
  { score: 1, value: "studio-guest-lin", username: "Lin" },
]

interface QuizPreviewState {
  index: number
  active: boolean
}

/** Per-room preview session. Defaults to an in-progress session so the card renders on first load. */
const byRoom = new Map<string, QuizPreviewState>()

function stateFor(roomId: string): QuizPreviewState {
  let state = byRoom.get(roomId)
  if (!state) {
    state = { index: 0, active: true }
    byRoom.set(roomId, state)
  }
  return state
}

function publicQuestion(index: number): Record<string, unknown> | null {
  const question = STUB_QUESTIONS[index]
  if (!question) return null
  return {
    id: question.id,
    text: question.text,
    index,
    total: STUB_QUESTIONS.length,
  }
}

/** Late-joiner hydration payload for `GET /api/rooms/:roomId/plugins/quiz-sessions/components`. */
export function buildStubQuizComponentState(roomId: string): Record<string, unknown> {
  const state = stateFor(roomId)
  return {
    activeQuestion: state.active ? publicQuestion(state.index) : null,
    leaderboard: STUB_LEADERBOARD,
    lastCorrectAnswer: null,
    autoAdvanceDeadline: null,
  }
}

export interface StubQuizEvent {
  type: string
  data: Record<string, unknown>
}

function event(name: string, data: Record<string, unknown>): StubQuizEvent {
  return { type: `PLUGIN:${QUIZ_PREVIEW_PLUGIN}:${name}`, data }
}

/** `SESSION_STARTED` for the optional `quizPreview=1` handshake flag (mirrors `pollPreview`). */
export function buildStubQuizSessionStarted(roomId: string): StubQuizEvent {
  const state = stateFor(roomId)
  state.index = 0
  state.active = true
  return event("SESSION_STARTED", {
    activeQuestion: publicQuestion(0),
    leaderboard: [],
    lastCorrectAnswer: null,
    autoAdvanceDeadline: null,
  })
}

function sessionEndedEvent(): StubQuizEvent {
  return event("SESSION_ENDED", {
    activeQuestion: null,
    leaderboard: STUB_LEADERBOARD,
    lastCorrectAnswer: null,
    autoAdvanceDeadline: null,
    results: { leaderboard: STUB_LEADERBOARD },
  })
}

/**
 * Drive the in-memory preview session from an admin action and return the
 * `PLUGIN:quiz-sessions:*` events to broadcast plus a toast message.
 */
export function runStubQuizAction(
  roomId: string,
  action: string,
  _params?: Record<string, unknown>,
): { success: boolean; message: string; events: StubQuizEvent[] } {
  const state = stateFor(roomId)
  switch (action) {
    case "startSession": {
      state.index = 0
      state.active = true
      return {
        success: true,
        message: "Quiz started (preview stub).",
        events: [
          event("SESSION_STARTED", {
            activeQuestion: publicQuestion(0),
            leaderboard: [],
            lastCorrectAnswer: null,
            autoAdvanceDeadline: null,
          }),
        ],
      }
    }
    case "advanceQuestion": {
      if (!state.active) {
        return { success: false, message: "No active quiz session.", events: [] }
      }
      if (state.index >= STUB_QUESTIONS.length - 1) {
        state.active = false
        return { success: true, message: "Quiz ended (preview stub).", events: [sessionEndedEvent()] }
      }
      state.index += 1
      return {
        success: true,
        message: `Advanced to question ${state.index + 1}.`,
        events: [
          event("QUESTION_ADVANCED", {
            activeQuestion: publicQuestion(state.index),
            autoAdvanceDeadline: null,
          }),
        ],
      }
    }
    case "endSession": {
      if (!state.active) {
        return { success: false, message: "No active quiz session.", events: [] }
      }
      state.active = false
      return { success: true, message: "Quiz ended (preview stub).", events: [sessionEndedEvent()] }
    }
    case "updateReward": {
      return { success: true, message: "Coin reward updated (preview stub).", events: [] }
    }
    default:
      return { success: false, message: `Unknown quiz action: ${action}`, events: [] }
  }
}
