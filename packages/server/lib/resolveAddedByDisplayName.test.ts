import { describe, it, expect } from "vitest"
import {
  buildUserDisplayNameLookup,
  resolveAddedByDisplayName,
  enrichQueueItemsForExport,
} from "./resolveAddedByDisplayName"
import type { User } from "@repo/types/User"
import type { QueueItem } from "@repo/types/Queue"

describe("resolveAddedByDisplayName", () => {
  it("prefers lookup username over snapshot when both exist", () => {
    const lookup = buildUserDisplayNameLookup(
      [{ userId: "u1", username: "Fresh" } as User],
      [{ userId: "u1", username: "Stale" } as User],
    )
    const item = {
      addedBy: { userId: "u1", username: "OldSnapshot" },
    } as QueueItem
    expect(resolveAddedByDisplayName(item, lookup)).toBe("Fresh")
  })

  it("falls back to snapshot when user not in lookup", () => {
    const lookup = buildUserDisplayNameLookup([], [])
    const item = {
      addedBy: { userId: "u1", username: "OnlySnapshot" },
    } as QueueItem
    expect(resolveAddedByDisplayName(item, lookup)).toBe("OnlySnapshot")
  })

  it("enriches queue items with resolved username", () => {
    const lookup = buildUserDisplayNameLookup([{ userId: "u1", username: "N" } as User], [])
    const items = [
      { title: "T", track: { title: "T" } as any, addedBy: { userId: "u1" }, addedAt: 1 },
    ] as QueueItem[]
    const out = enrichQueueItemsForExport(items, lookup)
    expect(out[0].addedBy?.username).toBe("N")
  })
})
