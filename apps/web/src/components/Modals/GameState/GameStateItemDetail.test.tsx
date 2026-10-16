import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { ChakraProvider } from "@chakra-ui/react"
import { renderToStaticMarkup } from "react-dom/server"
import type { ItemDefinition } from "@repo/types"
import { system } from "../../../theme/chakraTheme"
import type { GameStateItemDetailFrame } from "../../../types/GameStateDetail"
import GameStateItemDetail from "./GameStateItemDetail"

vi.mock("../../ItemModelViewer", () => ({
  default: ({ mode }: { mode: string }) => <div data-testid="item-model" data-mode={mode} />,
}))
vi.mock("../../../hooks/useActors", () => ({
  useCanAddToQueue: () => false,
  useIsAdmin: () => false,
}))
vi.mock("../../../hooks/useSocketMachine", () => ({
  useSocketMachine: () => [
    { context: { tracks: [], error: null }, matches: () => false },
    () => {},
  ],
}))
vi.mock("../../../hooks/useTrackRoomPresence", () => ({
  useTrackRoomPresence: () => ({ getPresence: () => undefined }),
}))
vi.mock("../../useAddToQueue", () => ({
  default: () => ({ addToQueue: () => {} }),
}))
vi.mock("../../../actors/trackPreviewActor", () => ({
  stopTrackPreview: () => {},
  toggleTrackPreview: () => {},
}))

const frame: GameStateItemDetailFrame = {
  kind: "item",
  shortId: "cold-beer",
  title: "Cold Beer",
  source: "shop",
}

function definition(overrides: Partial<ItemDefinition>): ItemDefinition {
  return {
    id: "item-shops:cold-beer",
    sourcePlugin: "item-shops",
    shortId: "cold-beer",
    name: "Cold Beer",
    description: "Move any song up +2 in the queue.",
    icon: "Beer",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    detailView: { layout: "default" },
    ...overrides,
  }
}

function render(ui: ReactElement) {
  return renderToStaticMarkup(<ChakraProvider value={system}>{ui}</ChakraProvider>)
}

describe("GameStateItemDetail lore and model", () => {
  it("renders lore after the description", () => {
    const html = render(
      <GameStateItemDetail
        frame={frame}
        definition={definition({ lore: "From the green room fridge.\n\nStill cold." })}
      />,
    )
    const descriptionAt = html.indexOf("Move any song up +2 in the queue.")
    const loreAt = html.indexOf("From the green room fridge.")
    expect(descriptionAt).toBeGreaterThan(-1)
    expect(loreAt).toBeGreaterThan(descriptionAt)
    expect(html).not.toContain('data-testid="item-model"')
  })

  it("shows the interactive model stage when the item has a model", () => {
    const html = render(
      <GameStateItemDetail frame={frame} definition={definition({ model: "model.glb" })} />,
    )
    expect(html).toContain('data-mode="stage"')
  })

  it("omits the lore block when lore is blank", () => {
    const withLore = render(
      <GameStateItemDetail frame={frame} definition={definition({ lore: "Cold." })} />,
    )
    const blank = render(
      <GameStateItemDetail frame={frame} definition={definition({ lore: "   " })} />,
    )
    expect(withLore).toContain("data-item-lore")
    expect(blank).not.toContain("data-item-lore")
  })

  it("renders lore as markdown", () => {
    const html = render(
      <GameStateItemDetail
        frame={frame}
        definition={definition({
          lore: "**Bold** and _quiet_.\nSee https://example.com/notes\n\n<b>raw</b>",
        })}
      />,
    )
    expect(html).toMatch(/<strong[^>]*>Bold<\/strong>/)
    expect(html).toMatch(/<em[^>]*>quiet<\/em>/)
    expect(html).toContain("<br")
    expect(html).toContain('href="https://example.com/notes"')
    expect(html).not.toContain("<b>raw</b>")
  })
})

describe("GameStateItemDetail track list lore", () => {
  const trackListFrame: GameStateItemDetailFrame = {
    kind: "item",
    shortId: "pm-al-1",
    title: "CD: Loveless",
    source: "shop",
    mediaKey: "pm-al-1",
  }

  it("renders lore under the description in the album header", () => {
    const html = render(
      <GameStateItemDetail
        frame={trackListFrame}
        definition={definition({
          shortId: "pm-al-1",
          name: "CD: Loveless",
          description: "A CD from the Record Store.",
          lore: "Recorded in *one* night.",
          detailView: { layout: "trackList" },
        })}
      />,
    )
    const descriptionAt = html.indexOf("A CD from the Record Store.")
    const loreAt = html.indexOf("Recorded in")
    expect(descriptionAt).toBeGreaterThan(-1)
    expect(loreAt).toBeGreaterThan(descriptionAt)
    expect(html).toMatch(/<em[^>]*>one<\/em>/)
  })

  it("omits the lore block when the record has none", () => {
    const html = render(
      <GameStateItemDetail
        frame={trackListFrame}
        definition={definition({
          shortId: "pm-al-1",
          name: "CD: Loveless",
          description: "A CD from the Record Store.",
          detailView: { layout: "trackList" },
        })}
      />,
    )
    expect(html).toContain("A CD from the Record Store.")
    expect(html).not.toContain("data-item-lore")
  })
})
