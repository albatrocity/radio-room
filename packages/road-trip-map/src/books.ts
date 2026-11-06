/**
 * Books (ADR 0228): read one on a trip for a buff that lasts until the trip
 * arrives or ends. A series has levels; a reader's level is the highest book
 * of it they've understood this trip, and a higher level replaces the lower
 * buff. Pure catalog data shared by the plugin, Game Studio, and web.
 */

export type BookSeries = "investment" | "negotiating" | "defensive-driving" | "mechanics"

/** `reader`: only the reader gets the buff. `van`: the whole van does, crediting its readers. */
export type BookScope = "reader" | "van"

export const BOOK_SERIES: Record<BookSeries, { scope: BookScope }> = {
  investment: { scope: "reader" },
  negotiating: { scope: "reader" },
  "defensive-driving": { scope: "van" },
  mechanics: { scope: "van" },
}

export type TripBookSpec = {
  shortId: string
  name: string
  emoji: string
  description: string
  coinValue: number
  rarity: "uncommon" | "rare"
  series: BookSeries
  /** 1 is the first book of a series; level n needs level n-1 understood first. */
  level: number
  /** The sign body when someone understands it. */
  learned: string
  /** Van books: the reason on an incident sign after "Doug read X, so ". */
  credit?: string
}

export const BOOK_IDS = {
  investmentAdvice: "investment-advice",
  negotiating: "negotiating-for-dummies",
  defensiveDriving: "defensive-driving",
  basicMechanics: "basics-of-automobile-mechanics",
  advancedMechanics: "advanced-automobile-mechanics",
} as const

export const TRIP_BOOKS: readonly TripBookSpec[] = [
  {
    shortId: BOOK_IDS.investmentAdvice,
    name: "Investment Advice",
    emoji: "📈",
    description: "Read it on a trip: coins you earn are worth 10% more until the trip ends.",
    coinValue: 25,
    rarity: "uncommon",
    series: "investment",
    level: 1,
    learned: "Coins they earn are worth 10% more for the rest of the trip.",
  },
  {
    shortId: BOOK_IDS.negotiating,
    name: "Negotiating for Dummies",
    emoji: "🤝",
    description: "Read it on a trip: shop prices are 10% lower for you until the trip ends.",
    coinValue: 25,
    rarity: "uncommon",
    series: "negotiating",
    level: 1,
    learned: "Shop prices are 10% lower for them for the rest of the trip.",
  },
  {
    shortId: BOOK_IDS.defensiveDriving,
    name: "Defensive Driving",
    emoji: "🚦",
    description: "Read it on a trip: traffic jams crawl at ×0.5 instead of ×0.4 for the whole van.",
    coinValue: 25,
    rarity: "uncommon",
    series: "defensive-driving",
    level: 1,
    learned: "Traffic jams won't be quite so slow for the rest of the trip.",
    credit: "the jam isn't quite so slow.",
  },
  {
    shortId: BOOK_IDS.basicMechanics,
    name: "The Basics of Automobile Mechanics",
    emoji: "🔧",
    description: "Read it on a trip: engine breakdowns take 25% less time for the whole van.",
    coinValue: 25,
    rarity: "uncommon",
    series: "mechanics",
    level: 1,
    learned: "Breakdowns will take 25% less time for the rest of the trip.",
    credit: "this takes 25% less time.",
  },
  {
    shortId: BOOK_IDS.advancedMechanics,
    name: "Advanced Automobile Mechanics",
    emoji: "🛠️",
    description:
      "Read it on a trip after The Basics: engine breakdowns take half as long for the whole van.",
    coinValue: 50,
    rarity: "rare",
    series: "mechanics",
    level: 2,
    learned: "Breakdowns will take half as long for the rest of the trip.",
    credit: "this takes half as long.",
  },
]

/** Buff sizes by series and level. */
export const BOOK_BUFFS = {
  /** Multiplier on the reader's positive coin gains. */
  investmentCoinMultiplier: 1.1,
  /** Scale on the reader's shop buy prices. */
  negotiatingPriceScale: 0.9,
  /** Jam slowdowns crawl no slower than this. */
  defensiveDrivingJamFactor: 0.5,
  /** Engine-breakdown waits scale by this, by mechanics level. */
  mechanicsTimeScale: { 1: 0.75, 2: 0.5 } as Record<number, number>,
} as const

export const BOOK_COPY = {
  known: "You already know this stuff.",
  overHead: "All of this stuff kind of went over your head.",
  offTrip: "Save it for a trip.",
} as const

/** The inventory button label for books. */
export const BOOK_USE_LABEL = "Read"

export function tripBook(shortId: string): TripBookSpec | undefined {
  return TRIP_BOOKS.find((book) => book.shortId === shortId)
}

export function bookAt(series: BookSeries, level: number): TripBookSpec | undefined {
  return TRIP_BOOKS.find((book) => book.series === series && book.level === level)
}

export type ReadOutcome = "learn" | "known" | "over-head"

/** What reading a level-`bookLevel` book does for a reader at `readerLevel` (0: never read the series). */
export function readOutcome(readerLevel: number, bookLevel: number): ReadOutcome {
  if (bookLevel <= readerLevel) return "known"
  return bookLevel === readerLevel + 1 ? "learn" : "over-head"
}

/** The van's level in each van-scope series: the highest any reader has. */
export type VanKnowledge = Partial<Record<BookSeries, number>>

/** "Doug", "Doug and Sam", "Doug, Sam, and Lee". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`
}

/** "Doug and Sam read Defensive Driving, so the jam isn't quite so slow." */
export function bookCreditLine(book: TripBookSpec, readers: readonly string[]): string {
  return `${joinNames(readers)} read ${book.name}, so ${book.credit ?? "it helps."}`
}
