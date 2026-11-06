import { describe, expect, it } from "vitest"
import { parseTripMap } from "./parseTripMap"
import { SAMPLE_TRIP_MAP } from "./sampleMap"
import { builtInEvent, incidentSteps, knowledgeCredit } from "./incidents"
import { BOOK_IDS, bookAt, bookCreditLine, joinNames, readOutcome, tripBook } from "./books"
import { VAN_ITEM_IDS } from "./van"

const parsed = parseTripMap(SAMPLE_TRIP_MAP)
if (!parsed.ok) throw new Error("sample map must parse")
const map = parsed.map

describe("readOutcome", () => {
  it("learns the next level, knows a lower one, and skips nothing", () => {
    expect(readOutcome(0, 1)).toBe("learn")
    expect(readOutcome(1, 2)).toBe("learn")
    expect(readOutcome(1, 1)).toBe("known")
    expect(readOutcome(2, 1)).toBe("known")
    expect(readOutcome(0, 2)).toBe("over-head")
  })
})

describe("book catalog", () => {
  it("levels the mechanics series", () => {
    expect(bookAt("mechanics", 1)?.shortId).toBe(BOOK_IDS.basicMechanics)
    expect(bookAt("mechanics", 2)?.shortId).toBe(BOOK_IDS.advancedMechanics)
    expect(tripBook(BOOK_IDS.advancedMechanics)?.rarity).toBe("rare")
  })

  it("credits readers by name", () => {
    expect(joinNames(["Doug"])).toBe("Doug")
    expect(joinNames(["Doug", "Sam"])).toBe("Doug and Sam")
    expect(joinNames(["Doug", "Sam", "Lee"])).toBe("Doug, Sam, and Lee")
    expect(bookCreditLine(tripBook(BOOK_IDS.basicMechanics)!, ["Doug"])).toBe(
      "Doug read The Basics of Automobile Mechanics, so this takes 25% less time.",
    )
    expect(bookCreditLine(tripBook(BOOK_IDS.defensiveDriving)!, ["Doug", "Sam"])).toBe(
      "Doug and Sam read Defensive Driving, so the jam isn't quite so slow.",
    )
  })
})

describe("van knowledge in incidents", () => {
  it("Defensive Driving lifts a jam to ×0.5 without shortening it", () => {
    const [slow] = incidentSteps(map, "traffic-jam", {
      mile: 1,
      parts: [],
      knowledge: { "defensive-driving": 1 },
    })
    expect(slow).toMatchObject({ kind: "slow", factor: 0.5, ms: 8 * 60_000 })
    expect(
      knowledgeCredit(map, builtInEvent("traffic-jam"), {
        mile: 1,
        parts: [],
        knowledge: { "defensive-driving": 1 },
      }),
    ).toBe("defensive-driving")
  })

  it("the horn wins over Defensive Driving, and the book gets no credit", () => {
    const ctx = { mile: 1, parts: [VAN_ITEM_IDS.horn], knowledge: { "defensive-driving": 1 } }
    expect(incidentSteps(map, "traffic-jam", ctx)[0]).toMatchObject({
      factor: 0.55,
      ms: 6 * 60_000,
    })
    expect(knowledgeCredit(map, builtInEvent("traffic-jam"), ctx)).toBeNull()
  })

  it("mechanics shortens every engine wait by level; the tow drive is untouched", () => {
    const plain = incidentSteps(map, "engine-failure", { mile: 9, parts: [] })
    const basic = incidentSteps(map, "engine-failure", {
      mile: 9,
      parts: [],
      knowledge: { mechanics: 1 },
    })
    const advanced = incidentSteps(map, "engine-failure", {
      mile: 9,
      parts: [],
      knowledge: { mechanics: 2 },
    })
    const waits = (steps: typeof plain) => steps.flatMap((s) => (s.kind === "wait" ? [s.ms] : []))
    expect(waits(basic)).toEqual(waits(plain).map((ms) => Math.round(ms * 0.75)))
    expect(waits(advanced)).toEqual(waits(plain).map((ms) => Math.round(ms * 0.5)))
    expect(basic.find((s) => s.kind === "tow")).toEqual(plain.find((s) => s.kind === "tow"))
  })

  it("mechanics leaves flats and jams alone", () => {
    const ctx = { mile: 1, parts: [], knowledge: { mechanics: 2 } }
    expect(incidentSteps(map, "blown-tire", ctx)).toEqual(
      incidentSteps(map, "blown-tire", { mile: 1, parts: [] }),
    )
    expect(knowledgeCredit(map, builtInEvent("blown-tire"), ctx)).toBeNull()
  })
})
