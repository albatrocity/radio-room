import { describe, expect, it } from "vitest"
import { describeIncident } from "./describeEvent"

describe("describeIncident", () => {
  it("describes a cleared out-of-gas incident as the refuel", () => {
    expect(
      describeIncident({
        kind: "incident",
        incident: "out-of-gas",
        source: "fuel",
        step: "cleared",
        at: 0,
        mile: 0,
      }),
    ).toBe("⛽ Refuelled by the fuel truck")
  })

  it("keeps the generic cleared line for other incidents", () => {
    expect(
      describeIncident({
        kind: "incident",
        incident: "blown-tire",
        source: "scripted",
        step: "cleared",
        at: 0,
        mile: 0,
      }),
    ).toBe("🛞 Blown tire cleared")
  })
})
