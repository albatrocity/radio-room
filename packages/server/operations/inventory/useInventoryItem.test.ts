import { describe, expect, test, vi } from "vitest"
import type { AppContext } from "@repo/types"
import { useInventoryItem } from "./useInventoryItem"

describe("useInventoryItem", () => {
  test("forwards toast title and duration from the plugin result", async () => {
    const useItem = vi.fn().mockResolvedValue({
      success: true,
      consumed: true,
      title: "Cassette restored to Good condition!",
      message: "You used the pencil to respool the tape and brought Mix Tape back to life.",
      duration: 10_000,
    })
    const context = { inventory: { useItem } } as unknown as AppContext

    await expect(
      useInventoryItem({
        context,
        roomId: "room1",
        userId: "u1",
        itemId: "item-1",
      }),
    ).resolves.toEqual({
      success: true,
      title: "Cassette restored to Good condition!",
      message: "You used the pencil to respool the tape and brought Mix Tape back to life.",
      duration: 10_000,
    })
  })

  test("forwards toastType from the plugin result", async () => {
    const useItem = vi.fn().mockResolvedValue({
      success: true,
      consumed: true,
      title: "Kid A dropped to Good condition!",
      message: "You scratched the CD.",
      toastType: "warning",
    })
    const context = { inventory: { useItem } } as unknown as AppContext

    await expect(
      useInventoryItem({
        context,
        roomId: "room1",
        userId: "u1",
        itemId: "item-1",
      }),
    ).resolves.toEqual({
      success: true,
      title: "Kid A dropped to Good condition!",
      message: "You scratched the CD.",
      toastType: "warning",
    })
  })

  test("omits title and duration when the plugin does not set them", async () => {
    const useItem = vi.fn().mockResolvedValue({
      success: true,
      consumed: true,
      message: "Used.",
    })
    const context = { inventory: { useItem } } as unknown as AppContext

    await expect(
      useInventoryItem({
        context,
        roomId: "room1",
        userId: "u1",
        itemId: "item-1",
      }),
    ).resolves.toEqual({
      success: true,
      message: "Used.",
    })
  })
})
