import { describe, expect, it, vi } from "vitest"
import type { KeyboardEvent, MouseEvent } from "react"
import type { ItemDetailView } from "@repo/types"
import { itemDetailClickableProps } from "./itemDetailClickableProps"
import { buildItemDetailFrame } from "./itemDetailFrame"

const trackList: ItemDetailView = { layout: "trackList" }
const defaultLayout: ItemDetailView = { layout: "default" }

function clickEventOn(tagName: string | null) {
  return {
    target: {
      closest: (selector: string) => {
        const tags = selector.split(",").map((part) => part.trim())
        return tagName != null && tags.includes(tagName) ? {} : null
      },
    },
  } as unknown as MouseEvent
}

describe("buildItemDetailFrame", () => {
  it("carries a mediaKey only for the track-list layout", () => {
    const shared = { shortId: "abc", title: "Kind of Blue", source: "inventory" as const }
    expect(buildItemDetailFrame({ ...shared, detailView: trackList }).mediaKey).toBe("abc")
    expect(buildItemDetailFrame({ ...shared, detailView: defaultLayout }).mediaKey).toBeUndefined()
    expect(buildItemDetailFrame({ ...shared, detailView: {} }).mediaKey).toBeUndefined()
  })

  it("keeps each surface's own id fields", () => {
    expect(
      buildItemDetailFrame({
        shortId: "abc",
        title: "Kind of Blue",
        source: "inventory",
        detailView: trackList,
        definitionId: "def-1",
        inventoryItemId: "inv-1",
      }),
    ).toEqual({
      kind: "item",
      shortId: "abc",
      title: "Kind of Blue",
      source: "inventory",
      definitionId: "def-1",
      inventoryItemId: "inv-1",
      mediaKey: "abc",
    })

    expect(
      buildItemDetailFrame({
        shortId: "abc",
        title: "Kind of Blue",
        source: "shop",
        detailView: defaultLayout,
        shopOfferId: 3,
      }),
    ).toEqual({
      kind: "item",
      shortId: "abc",
      title: "Kind of Blue",
      source: "shop",
      shopOfferId: 3,
    })
  })
})

describe("itemDetailClickableProps", () => {
  it("stays plain text without a detail view or handler", () => {
    expect(itemDetailClickableProps({ name: "Item", onOpen: vi.fn() })).toEqual({})
    expect(itemDetailClickableProps({ detailView: trackList, name: "Item" })).toEqual({})
  })

  it("prefers the configured action label", () => {
    const props = itemDetailClickableProps({
      detailView: { ...trackList, actionLabel: "View record" },
      name: "Kind of Blue",
      onOpen: vi.fn(),
    })
    expect(props["aria-label"]).toBe("View record")
    expect(
      itemDetailClickableProps({ detailView: trackList, name: "Kind of Blue", onOpen: vi.fn() })[
        "aria-label"
      ],
    ).toBe("View details for Kind of Blue")
  })

  it("leaves clicks on links inside the description to the link", () => {
    const onOpen = vi.fn()
    const props = itemDetailClickableProps({ detailView: trackList, name: "Item", onOpen })
    props.onClick?.(clickEventOn("a"))
    expect(onOpen).not.toHaveBeenCalled()
    props.onClick?.(clickEventOn("button"))
    expect(onOpen).not.toHaveBeenCalled()
    props.onClick?.(clickEventOn(null))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("opens on Enter and Space only", () => {
    const onOpen = vi.fn()
    const props = itemDetailClickableProps({ detailView: trackList, name: "Item", onOpen })
    const press = (key: string) => {
      const preventDefault = vi.fn()
      props.onKeyDown?.({ key, preventDefault } as unknown as KeyboardEvent)
      return preventDefault
    }
    expect(press("Tab")).not.toHaveBeenCalled()
    expect(press("Enter")).toHaveBeenCalled()
    expect(press(" ")).toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledTimes(2)
  })
})
