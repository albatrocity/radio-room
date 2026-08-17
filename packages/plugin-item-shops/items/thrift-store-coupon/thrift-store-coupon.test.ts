import { describe, expect, test } from "vitest"
import { THRIFT_STORE_COUPON_SHORT_ID, thriftStoreCoupon } from "./index"
import { createMockDefinition, createMockDeps, invokeUse } from "../shared/testHelpers"

describe("thrift-store-coupon", () => {
  test("explains redemption and does not consume on use", async () => {
    const deps = createMockDeps()
    const result = await invokeUse(
      thriftStoreCoupon,
      deps,
      "u1",
      createMockDefinition(THRIFT_STORE_COUPON_SHORT_ID),
    )

    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(result.message).toMatch(/add to queue/i)
    expect(result.message).toMatch(/library/i)
  })
})
