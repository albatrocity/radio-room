import { describe, expect, it } from "vitest"
import { getPluginUserState } from "./getPluginUserState"

describe("getPluginUserState", () => {
  it("returns null when bag is missing", () => {
    expect(getPluginUserState(undefined, "item-shops")).toBeNull()
    expect(getPluginUserState({}, "item-shops")).toBeNull()
  })

  it("returns null when plugin key is missing", () => {
    expect(getPluginUserState({ other: { a: 1 } }, "item-shops")).toBeNull()
  })

  it("returns the plugin bag when present", () => {
    const bag = getPluginUserState<{ currentShopInstance: { shopName: string } | null }>(
      { "item-shops": { currentShopInstance: { shopName: "Corner" } } },
      "item-shops",
    )
    expect(bag?.currentShopInstance?.shopName).toBe("Corner")
  })
})
