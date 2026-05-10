import { describe, expect, test } from "vitest"
import { cateredMeal } from "./index"
import { createMockDefinition, createMockDeps, invokeUse } from "../shared/testHelpers"

describe("cateredMeal", () => {
  test("tells user to keep passive defense in inventory", async () => {
    const deps = createMockDeps()
    const result = await invokeUse(cateredMeal, deps, "u1", createMockDefinition("catered-meal"))

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(true)
    expect(result.message).toMatch(/keep it in your inventory/i)
  })
})
