import { describe, it, expect } from "vitest"
import type { PluginActionElement, PluginConfigSchema, PluginFieldMeta } from "@repo/types/Plugin"
import {
  shouldShow,
  emptyRow,
  addRow,
  removeRow,
  updateRow,
  moveRow,
  getItemJsonSchema,
  getQuickAccessActions,
  getQuickAccessSchema,
} from "./logic"

describe("shouldShow (nested scope)", () => {
  it("returns true with no condition", () => {
    expect(shouldShow(undefined, {})).toBe(true)
  })

  it("evaluates a single condition against the given scope", () => {
    expect(shouldShow({ field: "enabled", value: true }, { enabled: true })).toBe(true)
    expect(shouldShow({ field: "enabled", value: true }, { enabled: false })).toBe(false)
  })

  it("ANDs an array of conditions", () => {
    const cond = [
      { field: "enabled", value: true },
      { field: "mode", value: "competitive" },
    ]
    expect(shouldShow(cond, { enabled: true, mode: "competitive" })).toBe(true)
    expect(shouldShow(cond, { enabled: true, mode: "inclusive" })).toBe(false)
  })

  it("resolves against a row object for nested (object-array) sub-fields", () => {
    // A sub-field visible only when the row's own `hasHint` is true.
    const row = { text: "Q1", hasHint: true, hint: "starts with A" }
    expect(shouldShow({ field: "hasHint", value: true }, row)).toBe(true)
    expect(shouldShow({ field: "hasHint", value: true }, { ...row, hasHint: false })).toBe(false)
  })
})

describe("object-array row operations", () => {
  const itemFields: { name: string; meta: PluginFieldMeta }[] = [
    { name: "text", meta: { type: "string", label: "Question" } },
    { name: "acceptedAnswers", meta: { type: "string-array", label: "Answers" } },
    { name: "points", meta: { type: "number", label: "Points" } },
    { name: "hasHint", meta: { type: "boolean", label: "Has hint" } },
  ]

  it("builds a typed empty row from item field defaults", () => {
    expect(emptyRow(itemFields)).toEqual({
      text: "",
      acceptedAnswers: [],
      points: 0,
      hasHint: false,
    })
  })

  it("adds, updates, removes, and reorders immutably", () => {
    let rows: Record<string, unknown>[] = []
    rows = addRow(rows, { text: "Q1", acceptedAnswers: ["a"] })
    rows = addRow(rows, { text: "Q2", acceptedAnswers: ["b"] })
    expect(rows).toHaveLength(2)

    const updated = updateRow(rows, 0, "acceptedAnswers", ["a", "alpha"])
    expect(updated[0].acceptedAnswers).toEqual(["a", "alpha"])
    expect(rows[0].acceptedAnswers).toEqual(["a"]) // original untouched

    const moved = moveRow(updated, 0, 1)
    expect((moved[0] as any).text).toBe("Q2")
    expect((moved[1] as any).text).toBe("Q1")

    const removed = removeRow(moved, 0)
    expect(removed).toHaveLength(1)
    expect((removed[0] as any).text).toBe("Q1")
  })

  it("moveRow is a no-op for out-of-range indices", () => {
    const rows = [{ a: 1 }, { a: 2 }]
    expect(moveRow(rows, 0, 5)).toBe(rows)
    expect(moveRow(rows, -1, 0)).toBe(rows)
    expect(moveRow(rows, 1, 1)).toBe(rows)
  })
})

describe("getItemJsonSchema (nested enum resolution)", () => {
  it("returns the items schema for an object-array field", () => {
    const jsonSchema = {
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: { difficulty: { enum: ["easy", "hard"] } },
          },
        },
      },
    }
    const itemSchema = getItemJsonSchema(jsonSchema, "questions")
    expect((itemSchema.properties as any).difficulty.enum).toEqual(["easy", "hard"])
  })

  it("returns empty object when items are not described", () => {
    expect(getItemJsonSchema({ properties: { questions: {} } }, "questions")).toEqual({})
    expect(getItemJsonSchema({}, "missing")).toEqual({})
  })
})

describe("getQuickAccessActions", () => {
  const startAction: PluginActionElement = {
    type: "action",
    action: "startSession",
    label: "Start",
  }
  const advanceAction: PluginActionElement = {
    type: "action",
    action: "advanceQuestion",
    label: "Advance",
  }
  const endAction: PluginActionElement = {
    type: "action",
    action: "endSession",
    label: "End",
  }

  const schema: PluginConfigSchema = {
    jsonSchema: {},
    layout: ["enabled", startAction, advanceAction, endAction],
    fieldMeta: {
      enabled: { type: "boolean", label: "Enable" },
    },
    quickAccess: ["advanceQuestion", "startSession", "missingAction"],
  }

  it("returns empty array when quickAccess is missing or empty", () => {
    expect(getQuickAccessActions({ ...schema, quickAccess: undefined })).toEqual([])
    expect(getQuickAccessActions({ ...schema, quickAccess: [] })).toEqual([])
  })

  it("returns actions in quickAccess order and skips unknown names", () => {
    expect(getQuickAccessActions(schema)).toEqual([advanceAction, startAction])
  })

  it("builds a filtered schema for panel rendering", () => {
    const filtered = getQuickAccessSchema(schema)
    expect(filtered?.layout).toEqual([advanceAction, startAction])
    expect(getQuickAccessSchema({ ...schema, quickAccess: ["nope"] })).toBeNull()
  })
})
