import { describe, expect, it } from "vitest"
import {
  conditionKeys,
  describeCondition,
  evaluateCondition,
  filterByCondition,
  keyItemFacts,
  NO_CONDITION_FACTS,
  pickNarrativeCase,
} from "./conditions"
import { siteOpenRoomShopRequest, siteShopRequest } from "./derive"
import { describeTripFlow } from "./flowOutline"
import { lintTripMap } from "./lint"
import { parseTripMap } from "./parseTripMap"
import { SAMPLE_BRANCH_MAP } from "./sampleBranchMap"
import {
  tripConditionSchema,
  tripMapSchema,
  tripOutcomeSchema,
  type TripCondition,
  type TripMap,
  type TripMapInput,
} from "./schema"
import {
  isTripKeyItemShortId,
  tripKeyIdForDefinition,
  tripKeyItemDefinitionId,
  tripKeyItemDefinitions,
  tripKeyItemFor,
  tripKeyItemShortId,
} from "./tripKeyItems"

const TICKET: TripCondition = { has: "ticket" }

/** The branch sample plus a ticket the Gas Stop gives on departure and the Diner reads. */
function keyedInput(): TripMapInput {
  const input = structuredClone(SAMPLE_BRANCH_MAP)
  // The ticket comes first; the sample's own Trail Pass stays after it.
  input.keyItems = [
    {
      id: "ticket",
      name: "Ticket Stub",
      icon: "🎟️",
      description: "From the overlook.",
      foundNarrative: "Someone pockets a ticket stub.",
    },
    ...(input.keyItems ?? []),
  ]
  for (const site of input.sites) {
    if (site.id === "gas-stop") site.onDepart = [{ kind: "give-key", key: "ticket" }]
    if (site.id === "diner") {
      site.narrative = "Pie, as usual."
      site.narrativeCases = [{ when: TICKET, text: "The owner squints at the stub." }]
      site.onVisit = [
        { kind: "unlock", layer: "local-tips", when: TICKET },
        { kind: "give-item", item: "road-trip:map-local", to: "random", when: { not: TICKET } },
      ]
    }
  }
  return input
}

function keyedMap(input: TripMapInput = keyedInput()): TripMap {
  return tripMapSchema.parse(input)
}

const DINER = SAMPLE_BRANCH_MAP.sites.findIndex((s) => s.id === "diner")
const GAS = SAMPLE_BRANCH_MAP.sites.findIndex((s) => s.id === "gas-stop")

function codes(map: TripMap): string[] {
  return lintTripMap(map).map((issue) => issue.code)
}

function nest(depth: number): TripCondition {
  let condition: TripCondition = TICKET
  for (let i = 1; i < depth; i++) condition = { not: condition }
  return condition
}

describe("condition grammar (ADR 0230)", () => {
  it("parses every combinator", () => {
    const condition = {
      all: [TICKET, { not: { has: "map" } }, { any: [{ has: "a" }, { has: "b" }] }],
    }
    expect(tripConditionSchema.parse(condition)).toEqual(condition)
  })

  it("allows 4 levels and rejects a fifth", () => {
    expect(tripConditionSchema.safeParse(nest(4)).success).toBe(true)
    const deep = tripConditionSchema.safeParse(nest(5))
    expect(deep.success).toBe(false)
    expect(deep.error?.issues[0]?.message).toMatch(/at most 4 levels/)
    // Depth counts through lists too.
    expect(tripConditionSchema.safeParse({ all: [nest(4)] }).success).toBe(false)
  })

  it("rejects empty lists, more than 8 children, mixed leaves, and unknown leaves", () => {
    expect(tripConditionSchema.safeParse({ all: [] }).success).toBe(false)
    expect(tripConditionSchema.safeParse({ any: Array(9).fill(TICKET) }).success).toBe(false)
    expect(tripConditionSchema.safeParse({ has: "ticket", not: TICKET }).success).toBe(false)
    expect(tripConditionSchema.safeParse({ flag: "x" }).success).toBe(false)
    expect(tripConditionSchema.safeParse({ has: "Not An Id" }).success).toBe(false)
  })

  it("evaluates has, not, all, and any against facts", () => {
    const facts = keyItemFacts(["ticket", "map"])
    expect(evaluateCondition(TICKET, facts)).toBe(true)
    expect(evaluateCondition({ has: "coin" }, facts)).toBe(false)
    expect(evaluateCondition({ not: TICKET }, facts)).toBe(false)
    expect(evaluateCondition({ not: { has: "coin" } }, facts)).toBe(true)
    expect(evaluateCondition({ all: [TICKET, { has: "map" }] }, facts)).toBe(true)
    expect(evaluateCondition({ all: [TICKET, { has: "coin" }] }, facts)).toBe(false)
    expect(evaluateCondition({ any: [{ has: "coin" }, { has: "map" }] }, facts)).toBe(true)
    expect(evaluateCondition({ any: [{ has: "coin" }, { has: "gem" }] }, facts)).toBe(false)
    expect(evaluateCondition(TICKET, NO_CONDITION_FACTS)).toBe(false)
  })

  it("lists the keys a condition reads once each", () => {
    expect(conditionKeys({ all: [TICKET, { not: TICKET }, { any: [{ has: "map" }] }] })).toEqual([
      "ticket",
      "map",
    ])
  })

  it("filters lists by when, keeping entries without one", () => {
    const list = [{ id: 1 }, { id: 2, when: TICKET }, { id: 3, when: { not: TICKET } }]
    expect(filterByCondition(list, keyItemFacts(["ticket"])).map((e) => e.id)).toEqual([1, 2])
    expect(filterByCondition(list, NO_CONDITION_FACTS).map((e) => e.id)).toEqual([1, 3])
  })

  it("picks the first matching narrative case, else the fallback", () => {
    const cases = [
      { when: { has: "map" }, text: "Map case", variant: "warning" as const },
      { when: TICKET, text: "Ticket case" },
      { when: TICKET, text: "Second ticket case" },
    ]
    const fallback = { text: "Plain", variant: "site" as const }
    expect(pickNarrativeCase(cases, fallback, keyItemFacts(["ticket"]))).toEqual({
      text: "Ticket case",
      variant: "site",
    })
    expect(pickNarrativeCase(cases, fallback, keyItemFacts(["map", "ticket"]))).toEqual({
      text: "Map case",
      variant: "warning",
    })
    expect(pickNarrativeCase(cases, fallback, NO_CONDITION_FACTS)).toEqual(fallback)
    expect(pickNarrativeCase(cases, {}, NO_CONDITION_FACTS)).toBeUndefined()
    expect(pickNarrativeCase(undefined, { text: "Plain" }, NO_CONDITION_FACTS)).toEqual({
      text: "Plain",
    })
    expect(pickNarrativeCase(cases, {}, keyItemFacts(["ticket"]))).toEqual({ text: "Ticket case" })
  })

  it("describes conditions in words", () => {
    const name = (id: string) => (id === "ticket" ? "Ticket Stub" : id)
    expect(describeCondition(TICKET, name)).toBe("van has Ticket Stub")
    expect(describeCondition({ not: TICKET }, name)).toBe("van lacks Ticket Stub")
    expect(describeCondition({ all: [TICKET, { has: "map" }] }, name)).toBe(
      "van has Ticket Stub and van has map",
    )
    expect(
      describeCondition({ any: [TICKET, { not: { all: [{ has: "a" }, { has: "b" }] } }] }, name),
    ).toBe("van has Ticket Stub or (not (van has a and van has b))")
  })
})

describe("key item schema (ADR 0230)", () => {
  it("parses key items, the new outcome kinds, narrative cases, and offer conditions", () => {
    const input = keyedInput()
    const gas = input.sites.find((s) => s.id === "gas-stop")!
    gas.shop = { offers: [{ definitionId: "road-trip:map-local", when: { not: TICKET } }] }
    gas.departNarrativeCases = [
      { when: TICKET, text: "The clerk waves the stub goodbye.", variant: "success" },
    ]
    const result = parseTripMap(input)
    expect(result.issues).toEqual([])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.map.keyItems?.[0]).toMatchObject({ id: "ticket", icon: "🎟️", coinValue: 0 })
    const diner = result.map.sites.find((s) => s.id === "diner")!
    expect(diner.onVisit?.[1]).toEqual({
      kind: "give-item",
      item: "road-trip:map-local",
      to: "random",
      qty: 1,
      when: { not: TICKET },
    })
    expect(result.map.sites.find((s) => s.id === "gas-stop")?.shop?.offers?.[0]?.when).toEqual({
      not: TICKET,
    })
  })

  it("defaults a key item's icon and coin value", () => {
    const map = keyedMap({ ...keyedInput(), keyItems: [{ id: "ticket", name: "Ticket Stub" }] })
    expect(map.keyItems?.[0]).toEqual({
      id: "ticket",
      name: "Ticket Stub",
      icon: "🔑",
      coinValue: 0,
    })
  })

  it("caps give-item quantity and requires a full item id", () => {
    const giveItem = { kind: "give-item", item: "road-trip:map-local", to: "everyone" }
    expect(tripOutcomeSchema.safeParse({ ...giveItem, qty: 3 }).success).toBe(true)
    expect(tripOutcomeSchema.safeParse({ ...giveItem, qty: 4 }).success).toBe(false)
    expect(tripOutcomeSchema.safeParse({ ...giveItem, to: "host" }).success).toBe(false)
    expect(tripOutcomeSchema.safeParse({ ...giveItem, item: "map-local" }).success).toBe(false)
  })

  it("rejects a too-deep condition anywhere in the map", () => {
    const input = keyedInput()
    input.sites.find((s) => s.id === "diner")!.narrativeCases = [
      { when: nest(5), text: "Too deep" },
    ]
    const result = parseTripMap(input)
    expect(result.ok).toBe(false)
    expect(result.issues[0]).toMatchObject({
      code: "schema",
      path: `sites.${DINER}.narrativeCases.0.when`,
    })
  })

  it("builds inert road-trip:key-* item definitions", () => {
    const map = keyedMap()
    expect(tripKeyItemDefinitions(map).slice(0, 1)).toEqual([
      {
        shortId: "key-ticket",
        name: "Ticket Stub",
        description: "From the overlook.",
        icon: "Key",
        stackable: false,
        maxStack: 1,
        tradeable: false,
        consumable: false,
        coinValue: 0,
        rarity: "common",
      },
    ])
    expect(tripKeyItemDefinitions(undefined)).toEqual([])
    expect(tripKeyItemShortId("ticket")).toBe("key-ticket")
    expect(tripKeyItemDefinitionId("ticket")).toBe("road-trip:key-ticket")
    expect(isTripKeyItemShortId("key-ticket")).toBe(true)
    expect(isTripKeyItemShortId("map-local")).toBe(false)
    expect(tripKeyItemFor(map, "key-ticket")?.name).toBe("Ticket Stub")
    expect(tripKeyItemFor(map, "key-nope")).toBeUndefined()
    expect(tripKeyIdForDefinition("road-trip:key-ticket")).toBe("ticket")
    expect(tripKeyIdForDefinition("road-trip:map-local")).toBeUndefined()
    expect(tripKeyIdForDefinition("item-shops:key-ticket")).toBeUndefined()
  })
})

describe("conditional shop offers (ADR 0230)", () => {
  const site = {
    name: "Belfry",
    shop: {
      offers: [
        { definitionId: "road-trip:fix-a-flat" },
        { definitionId: "road-trip:cb-radio", basePrice: 40, when: TICKET },
        { definitionId: "road-trip:key-ticket", basePrice: 10 },
      ],
    },
  }

  it("lists the whole pool, without conditions, when no facts are given", () => {
    expect(siteShopRequest(site)).toEqual({
      offers: [
        { definitionId: "road-trip:fix-a-flat" },
        { definitionId: "road-trip:cb-radio", basePrice: 40 },
        { definitionId: "road-trip:key-ticket", basePrice: 10 },
      ],
    })
  })

  it("drops offers whose when fails", () => {
    expect(siteShopRequest(site, NO_CONDITION_FACTS)?.offers?.map((o) => o.definitionId)).toEqual([
      "road-trip:fix-a-flat",
      "road-trip:key-ticket",
    ])
  })

  it("drops offers for key items the van already holds", () => {
    expect(siteShopRequest(site, keyItemFacts(["ticket"]))?.offers).toEqual([
      { definitionId: "road-trip:fix-a-flat" },
      { definitionId: "road-trip:cb-radio", basePrice: 40 },
    ])
  })

  it("opens no shop when every offer is filtered out", () => {
    const only = { shop: { offers: [{ definitionId: "road-trip:cb-radio", when: TICKET }] } }
    expect(siteShopRequest(only, NO_CONDITION_FACTS)).toBeNull()
    expect(siteShopRequest(only)).not.toBeNull()
  })

  it("threads facts through the open-shop request", () => {
    const map = keyedMap()
    const gas = { ...map.sites.find((s) => s.id === "gas-stop")! }
    gas.shop = { offers: [{ definitionId: "road-trip:map-local", when: TICKET }] }
    expect(siteOpenRoomShopRequest(gas, "scope", NO_CONDITION_FACTS)).toBeNull()
    expect(siteOpenRoomShopRequest(gas, "scope", keyItemFacts(["ticket"]))?.offers).toEqual([
      { definitionId: "road-trip:map-local" },
    ])
  })
})

describe("key item lint (ADR 0230)", () => {
  it("is clean for a key that is given and read", () => {
    expect(lintTripMap(keyedMap())).toEqual([])
  })

  it("flags duplicate key ids", () => {
    const input = keyedInput()
    input.keyItems = [input.keyItems![0]!, { id: "ticket", name: "Another" }]
    const issue = lintTripMap(keyedMap(input)).find((i) => i.code === "duplicate-key-id")
    expect(issue).toMatchObject({ severity: "error", path: "keyItems.1.id" })
  })

  it("flags unknown keys in give-key, take-key, give-item, conditions, and offers", () => {
    const input = keyedInput()
    const diner = input.sites.find((s) => s.id === "diner")!
    diner.onDepart = [
      { kind: "take-key", key: "ghost" },
      { kind: "give-key", key: "phantom" },
      { kind: "give-item", item: "road-trip:key-spook", to: "everyone" },
    ]
    diner.departNarrativeCases = [{ when: { any: [TICKET, { has: "wraith" }] }, text: "Boo" }]
    diner.shop = { offers: [{ definitionId: "road-trip:key-shade" }] }
    const unknown = lintTripMap(keyedMap(input)).filter((i) => i.code === "unknown-key")
    expect(unknown.every((i) => i.severity === "error")).toBe(true)
    expect(unknown.map((i) => i.path)).toEqual([
      `sites.${DINER}.onDepart.0.key`,
      `sites.${DINER}.onDepart.1.key`,
      `sites.${DINER}.onDepart.2.item`,
      `sites.${DINER}.departNarrativeCases.0.when`,
      `sites.${DINER}.shop.offers.0.definitionId`,
    ])
    expect(unknown[3]?.message).toMatch(/"wraith"/)
  })

  it("warns about a key nothing gives or sells, and counts a shop offer as a source", () => {
    const input = keyedInput()
    input.sites.find((s) => s.id === "gas-stop")!.onDepart = undefined
    const issue = lintTripMap(keyedMap(input)).find((i) => i.code === "key-never-given")
    expect(issue).toMatchObject({ severity: "warning", path: "keyItems.0" })

    input.sites.find((s) => s.id === "gas-stop")!.shop = {
      offers: [{ definitionId: "road-trip:key-ticket", basePrice: 5 }],
    }
    expect(codes(keyedMap(input))).not.toContain("key-never-given")
  })

  it("warns when a condition reads a key changed earlier in the same list", () => {
    const input = keyedInput()
    input.sites.find((s) => s.id === "gas-stop")!.onDepart = [
      { kind: "give-key", key: "ticket" },
      { kind: "unlock", layer: "local-tips", when: TICKET },
    ]
    const issue = lintTripMap(keyedMap(input)).find(
      (i) => i.code === "condition-reads-same-list-grant",
    )
    expect(issue).toMatchObject({ severity: "warning", path: `sites.${GAS}.onDepart.1.when` })
    expect(issue?.message).toMatch(/Ticket Stub, which is given earlier/)
  })

  it("does not warn when the grant is in another list or after the reader", () => {
    const input = keyedInput()
    input.sites.find((s) => s.id === "gas-stop")!.onDepart = [
      { kind: "unlock", layer: "local-tips", when: { not: TICKET } },
      { kind: "give-key", key: "ticket" },
    ]
    expect(codes(keyedMap(input))).not.toContain("condition-reads-same-list-grant")
  })

  it("warns for a take-key earlier in the same list too", () => {
    const input = keyedInput()
    input.sites.find((s) => s.id === "diner")!.onDepart = [
      { kind: "take-key", key: "ticket" },
      { kind: "divert", route: "detour", when: TICKET },
    ]
    const issue = lintTripMap(keyedMap(input)).find(
      (i) => i.code === "condition-reads-same-list-grant",
    )
    expect(issue?.message).toMatch(/is taken earlier/)
  })
})

describe("flow outline with conditions (ADR 0230)", () => {
  it("lists key items and names conditional outcome sources with their when", () => {
    const flow = describeTripFlow(keyedMap())
    expect(flow.keyItems.filter((key) => key.id === "ticket")).toEqual([
      {
        id: "ticket",
        name: "Ticket Stub",
        icon: "🎟️",
        givenBy: ["Gas Stop, on departure"],
        takenBy: [],
        soldAt: [],
        readBy: ["Roadside Diner", "Roadside Diner, on arrival"],
      },
    ])
    const layer = flow.layers.find((l) => l.id === "local-tips")!
    expect(layer.unlockedBy).toContain("Roadside Diner (if van has Ticket Stub)")
    expect(layer.unlockedBy).toContain("Welcome Center")
  })
})
