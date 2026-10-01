import { describe, expect, test } from "vitest"
import { queueItemFactory } from "@repo/factories"
import type { QueueItem } from "@repo/types/Queue"
import {
  findPinViolation,
  findPlayOutOfOrderViolation,
  findRemovalViolation,
  isForeignPin,
  minInsertIndex,
} from "./queuePins"

function row(id: string, pin?: { pluginName: string; blockId: string }): QueueItem {
  return queueItemFactory.build({
    mediaSource: { type: "spotify", trackId: id },
    ...(pin ? { pin } : {}),
  })
}

const quiz = { pluginName: "quiz", blockId: "b1" }
const HELD = "This part of the queue is held by quiz"

describe("isForeignPin", () => {
  test("unpinned rows and the owner's rows are not foreign", () => {
    expect(isForeignPin(row("a"))).toBe(false)
    expect(isForeignPin(row("a", quiz), "quiz")).toBe(false)
  })

  test("another actor's pin is foreign", () => {
    expect(isForeignPin(row("a", quiz))).toBe(true)
    expect(isForeignPin(row("a", quiz), "other")).toBe(true)
  })
})

describe("findPinViolation", () => {
  const p1 = row("p1", quiz)
  const p2 = row("p2", quiz)
  const x = row("x")
  const y = row("y")

  test("allows reordering unpinned rows after the block", () => {
    expect(findPinViolation([p1, p2, x, y], [p1, p2, y, x])).toBeNull()
  })

  test("rejects moving a row ahead of the block", () => {
    expect(findPinViolation([p1, p2, x], [x, p1, p2])).toBe(HELD)
  })

  test("rejects splitting or reordering the block", () => {
    expect(findPinViolation([p1, p2, x], [p1, x, p2])).toBe(HELD)
    expect(findPinViolation([p1, p2, x], [p2, p1, x])).toBe(HELD)
  })

  test("allows moving the block earlier", () => {
    expect(findPinViolation([x, p1, p2], [p1, p2, x])).toBeNull()
  })

  test("the owner may reorder its own block", () => {
    expect(findPinViolation([p1, p2, x], [x, p2, p1], "quiz")).toBeNull()
  })
})

describe("findRemovalViolation", () => {
  test("rejects removing a foreign pinned row only", () => {
    expect(findRemovalViolation(row("p", quiz))).toBe(HELD)
    expect(findRemovalViolation(row("p", quiz), "quiz")).toBeNull()
    expect(findRemovalViolation(row("x"))).toBeNull()
  })
})

describe("findPlayOutOfOrderViolation", () => {
  const queue = [row("p1", quiz), row("p2", quiz), row("x")]

  test("allows playing the head", () => {
    expect(findPlayOutOfOrderViolation(queue, 0)).toBeNull()
  })

  test("rejects playing past or inside a foreign block", () => {
    expect(findPlayOutOfOrderViolation(queue, 2)).toBe(HELD)
    expect(findPlayOutOfOrderViolation(queue, 1)).toBe(HELD)
  })

  test("the owner may jump within its block", () => {
    expect(findPlayOutOfOrderViolation(queue, 2, "quiz")).toBeNull()
  })
})

describe("minInsertIndex", () => {
  test("is zero without foreign pins", () => {
    expect(minInsertIndex([row("x"), row("y")])).toBe(0)
  })

  test("is just after the last foreign pinned row", () => {
    expect(minInsertIndex([row("p1", quiz), row("p2", quiz), row("x")])).toBe(2)
    expect(minInsertIndex([row("p1", quiz), row("x")], "quiz")).toBe(0)
  })
})
