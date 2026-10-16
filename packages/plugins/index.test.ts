import { describe, expect, it } from "vitest"
import { pluginFactories } from "./index"

describe("pluginFactories", () => {
  it("builds each plugin without a room context, under a unique kebab-case name", () => {
    const names = pluginFactories.map((factory) => factory().name)

    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-z0-9-]*$/)
    }
    expect(new Set(names).size).toBe(names.length)
  })
})
