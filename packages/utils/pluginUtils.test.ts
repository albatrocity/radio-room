import { describe, expect, it } from "vitest"
import {
  checkShowWhenCondition,
  checkShowWhenConditions,
  resolveShowWhenPath,
} from "./pluginUtils"

describe("resolveShowWhenPath", () => {
  it("resolves bare fields from config then store", () => {
    expect(resolveShowWhenPath("enabled", { enabled: true }, {})).toBe(true)
    expect(resolveShowWhenPath("count", {}, { count: 3 })).toBe(3)
    expect(resolveShowWhenPath("enabled", { enabled: false }, { enabled: true })).toBe(false)
  })

  it("resolves item.* and viewer.* prefixes", () => {
    expect(
      resolveShowWhenPath("item.isDeputyDj", {}, {}, { isDeputyDj: true }, { userId: "u1" }),
    ).toBe(true)
    expect(
      resolveShowWhenPath("viewer.userId", {}, {}, undefined, { userId: "u1" }),
    ).toBe("u1")
  })
})

describe("checkShowWhenCondition", () => {
  it("matches equality on config/store/item/viewer", () => {
    expect(checkShowWhenCondition({ field: "enabled", value: true }, { enabled: true }, {})).toBe(
      true,
    )
    expect(
      checkShowWhenCondition(
        { field: "item.isDeputyDj", value: true },
        {},
        {},
        { isDeputyDj: true },
      ),
    ).toBe(true)
    expect(
      checkShowWhenCondition(
        { field: "viewer.userId", value: "u1" },
        {},
        {},
        undefined,
        { userId: "u1" },
      ),
    ).toBe(true)
  })

  it("supports includes / notIncludes against viewer.userId", () => {
    const store = { eligibleUserIds: ["u1", "u2"] }
    const viewer = { userId: "u1" }

    expect(
      checkShowWhenCondition(
        { field: "eligibleUserIds", includes: "viewer.userId" },
        {},
        store,
        undefined,
        viewer,
      ),
    ).toBe(true)

    expect(
      checkShowWhenCondition(
        { field: "eligibleUserIds", notIncludes: "viewer.userId" },
        {},
        store,
        undefined,
        viewer,
      ),
    ).toBe(false)

    expect(
      checkShowWhenCondition(
        { field: "eligibleUserIds", notIncludes: "viewer.userId" },
        {},
        store,
        undefined,
        { userId: "u3" },
      ),
    ).toBe(true)
  })

  it("returns false for includes when field is not an array", () => {
    expect(
      checkShowWhenCondition(
        { field: "eligibleUserIds", includes: "viewer.userId" },
        {},
        { eligibleUserIds: "u1" },
        undefined,
        { userId: "u1" },
      ),
    ).toBe(false)
  })
})

describe("checkShowWhenConditions", () => {
  it("requires all conditions (AND)", () => {
    expect(
      checkShowWhenConditions(
        [
          { field: "enabled", value: true },
          { field: "eligibleUserIds", includes: "viewer.userId" },
        ],
        { enabled: true },
        { eligibleUserIds: ["u1"] },
        undefined,
        { userId: "u1" },
      ),
    ).toBe(true)

    expect(
      checkShowWhenConditions(
        [
          { field: "enabled", value: true },
          { field: "eligibleUserIds", includes: "viewer.userId" },
        ],
        { enabled: true },
        { eligibleUserIds: ["u2"] },
        undefined,
        { userId: "u1" },
      ),
    ).toBe(false)
  })
})
