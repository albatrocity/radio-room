import { describe, expect, test } from "vitest"
import { SWEETWATER_SHOP } from "./index"

describe("SWEETWATER_SHOP", () => {
  test("opening DM uses the info alert variant", () => {
    expect(SWEETWATER_SHOP.openingMessageMeta).toEqual({
      type: "alert",
      status: "info",
      title: "Message from your Sweetwater Rep",
    })
  })
})
