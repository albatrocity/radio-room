import { describe, expect, it } from "vitest"
import { snoozePedal } from "."

describe("snooze-pedal", () => {
  it("registers the expected shortId", () => {
    expect(snoozePedal.shortId).toBe("snooze-pedal")
  })
})
