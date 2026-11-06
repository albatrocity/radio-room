import { BOOK_COPY, BOOK_SERIES, readOutcome, tripBook } from "@repo/road-trip-map"
import type { Transition } from "./helpers"
import { readerLevel, type TripState } from "./state"

/**
 * Books (ADR 0228). A reader's level in a series is the highest book of it
 * they understood this trip; the next level replaces the lower buff, a lower
 * or equal one is refused (kept), and skipping ahead spends the book for
 * nothing. Van books are remembered with each reader so incident signs can
 * credit them; reader books apply a modifier through a `book-buff` effect.
 */

type Traveler = { userId: string; name: string }

export function isBookTrip(state: TripState | null): state is TripState {
  return state !== null && (state.status === "loaded" || state.status === "driving")
}

/** Reading `shortId` now: refused (kept) with a message, or the outcome. */
export function routeRead(
  state: TripState | null,
  shortId: string,
  userId: string,
): { kind: "refused"; message: string } | { kind: "read"; learned: boolean } | null {
  const book = tripBook(shortId)
  if (!book) return null
  if (!isBookTrip(state)) return { kind: "refused", message: BOOK_COPY.offTrip }
  const outcome = readOutcome(readerLevel(state, book.series, userId), book.level)
  if (outcome === "known") return { kind: "refused", message: BOOK_COPY.known }
  return { kind: "read", learned: outcome === "learn" }
}

export function readBook(shortId: string, user: Traveler): Transition {
  return (state, { now }) => {
    const book = tripBook(shortId)
    const route = routeRead(state, shortId, user.userId)
    if (!book || route?.kind !== "read") return null
    const sign = {
      type: "sign" as const,
      variant: "info" as const,
      icon: book.emoji,
      title: `${user.name} read ${book.name}`,
    }
    if (!route.learned) {
      return {
        next: state,
        log: [{ kind: "book-read", shortId, userId: user.userId, name: user.name, learned: false }],
        effects: [{ ...sign, body: "It kind of went over their head." }],
      }
    }
    const readers = state.books?.[book.series] ?? {}
    return {
      next: {
        ...state,
        books: {
          ...state.books,
          [book.series]: {
            ...readers,
            [user.userId]: { level: book.level, name: user.name, at: now },
          },
        },
      },
      log: [{ kind: "book-read", shortId, userId: user.userId, name: user.name, learned: true }],
      effects: [
        { ...sign, variant: "success", body: book.learned },
        ...(BOOK_SERIES[book.series].scope === "reader"
          ? [{ type: "book-buff" as const, userId: user.userId, shortId }]
          : []),
      ],
    }
  }
}
