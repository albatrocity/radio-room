import { describe, expect, it } from "vitest"
import { validateItemUseFormValues } from "./validateItemUseForm"
import type { PluginActionFormField } from "@repo/types"

const kickstarterForm: PluginActionFormField[] = [
  { name: "title", label: "Campaign title", type: "string", required: true },
  { name: "goal", label: "Goal (coin)", type: "number", required: true, integer: true, min: 1 },
  { name: "rewards", label: "Backer rewards", type: "textarea", required: true },
]

describe("validateItemUseFormValues", () => {
  it("accepts and coerces valid kickstarter fields", () => {
    const result = validateItemUseFormValues(kickstarterForm, {
      title: " My project ",
      goal: "50",
      rewards: "A thank-you",
      extra: "drop-me",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.formValues).toEqual({
      title: " My project ",
      goal: 50,
      rewards: "A thank-you",
    })
  })

  it("rejects a missing required field", () => {
    const result = validateItemUseFormValues(kickstarterForm, {
      title: "x",
      goal: 10,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.result.consumed).toBe(false)
    expect(result.result.message).toMatch(/Backer rewards/)
  })

  it("rejects a non-integer when integer is required", () => {
    const result = validateItemUseFormValues(kickstarterForm, {
      title: "x",
      goal: 1.5,
      rewards: "y",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.result.message).toMatch(/whole number/)
  })

  it("rejects below min", () => {
    const result = validateItemUseFormValues(kickstarterForm, {
      title: "x",
      goal: 0,
      rewards: "y",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.result.message).toMatch(/at least 1/)
  })

  it("clamps long strings", () => {
    const long = "a".repeat(3000)
    const result = validateItemUseFormValues(
      [{ name: "note", label: "Note", type: "string", required: true }],
      { note: long },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.formValues.note as string).length).toBe(2000)
  })
})
