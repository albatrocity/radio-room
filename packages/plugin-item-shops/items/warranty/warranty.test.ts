import { describe, expect, test } from "vitest"
import { warranty } from "./index"
import { createMockDefinition, createMockDeps, invokeUse } from "../shared/testHelpers"

describe("warranty", () => {
  test("tells user to keep passive defense in inventory", async () => {
    const deps = createMockDeps()
    const result = await invokeUse(warranty, deps, "u1", createMockDefinition("warranty"))

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(true)
    expect(result.message).toMatch(/keep it in your inventory/i)
  })
})
