import { describe, expect, it } from "vitest"
import { AUTOMATIC_FUND_HOLD_MS, fundHoldMs, fundPoolTitle } from "./helpers"

const map = {
  tuning: { funds: { windowMinutes: 3 } },
  sites: [{ id: "gas-n-go", name: "Gas 'n' Go" }],
}

describe("fund timing and titles", () => {
  it("uses the short automatic hold and the map window otherwise", () => {
    expect(fundHoldMs("automatic", map)).toBe(AUTOMATIC_FUND_HOLD_MS)
    expect(fundHoldMs("voluntary", map)).toBe(3 * 60_000)
  })

  it("names a gas pool for the site and an incident pool for its provider", () => {
    expect(fundPoolTitle({ purpose: "gas", siteId: "gas-n-go" }, map)).toBe("Gas at Gas 'n' Go")
    expect(fundPoolTitle({ purpose: "repair", provider: "the tow truck" }, map)).toBe(
      "Repairs · the tow truck",
    )
  })
})
