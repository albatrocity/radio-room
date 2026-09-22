import { describe, expect, test } from "vitest"
import {
  defaultSkipRequiresQueueConfig,
  shouldSkipGivenQueue,
  skipRequiresQueueConfigSchema,
} from "./skipRequiresQueue"

describe("skipRequiresQueueConfigSchema", () => {
  test("accepts valid config", () => {
    expect(
      skipRequiresQueueConfigSchema.parse({
        skipRequiresQueue: true,
        skipRequiresQueueMin: 3,
      }),
    ).toEqual({ skipRequiresQueue: true, skipRequiresQueueMin: 3 })
  })

  test("rejects negative skipRequiresQueueMin", () => {
    expect(() =>
      skipRequiresQueueConfigSchema.parse({
        skipRequiresQueue: false,
        skipRequiresQueueMin: -1,
      }),
    ).toThrow()
  })
})

describe("shouldSkipGivenQueue", () => {
  test("always allows skip when skipRequiresQueue is false", () => {
    const config = { ...defaultSkipRequiresQueueConfig, skipRequiresQueue: false }
    expect(shouldSkipGivenQueue(0, config)).toBe(true)
    expect(shouldSkipGivenQueue(100, config)).toBe(true)
  })

  test("requires queueLength > min when skipRequiresQueue is true", () => {
    const config = { skipRequiresQueue: true, skipRequiresQueueMin: 2 }
    expect(shouldSkipGivenQueue(0, config)).toBe(false)
    expect(shouldSkipGivenQueue(2, config)).toBe(false)
    expect(shouldSkipGivenQueue(3, config)).toBe(true)
  })
})
