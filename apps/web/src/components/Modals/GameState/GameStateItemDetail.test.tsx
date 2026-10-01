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
    const html = render(
      <GameStateItemDetail frame={frame} definition={definition({ lore: "   " })} />,
    )
    expect(html.match(/white-space:pre-wrap/g)?.length ?? 0).toBe(1)
  })
})
