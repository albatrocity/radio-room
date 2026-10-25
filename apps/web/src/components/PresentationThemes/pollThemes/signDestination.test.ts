import { describe, expect, it } from "vitest"
import type { TripStoreSite } from "@repo/road-trip-map"
import { namedTripSites, signDestination, signDestinationKey } from "./signDestination"

function site(
  id: string,
  name: string | undefined,
  state: TripStoreSite["state"],
): Pick<TripStoreSite, "id" | "name" | "state"> {
  return { id, state, ...(name ? { name } : {}) }
}

describe("signDestination", () => {
  const sites = [
    site("records", "Dusty Boots Records", "polling"),
    site("lookout", "Lookout", "ahead"),
    site("secret", undefined, "unrevealed"),
  ]

  it("opens the revealed site the poll's subject id names", () => {
    expect(signDestination(sites, "records")).toEqual({
      id: "records",
      name: "Dusty Boots Records",
    })
    expect(signDestination(sites, "lookout")).toEqual({ id: "lookout", name: "Lookout" })
  })

  it("leaves the sign inert without a revealed subject", () => {
    expect(signDestination(sites, undefined)).toBeNull()
    expect(signDestination(sites, "")).toBeNull()
    expect(signDestination(sites, "   ")).toBeNull()
    expect(signDestination(sites, "missing")).toBeNull()
    expect(signDestination(sites, "secret")).toBeNull()
  })
})

describe("signDestinationKey", () => {
  it("reads the subject id off the trip store", () => {
    const store = {
      trip: {
        sites: [
          { id: "records", name: "Dusty Boots Records", state: "polling" },
          { id: "secret", state: "unrevealed" },
          { nope: true },
        ],
      },
    }
    expect(namedTripSites(store)).toEqual([
      { id: "records", name: "Dusty Boots Records", state: "polling" },
      { id: "secret", state: "unrevealed" },
    ])
    expect(signDestinationKey(store, "records")).toBe("records\0Dusty Boots Records")
    expect(signDestinationKey(store, undefined)).toBe("")
    expect(signDestinationKey(undefined, "records")).toBe("")
  })
})
