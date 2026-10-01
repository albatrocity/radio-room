import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { ChakraProvider } from "@chakra-ui/react"
import { renderToStaticMarkup } from "react-dom/server"
import { system } from "../theme/chakraTheme"
import ItemArtwork from "./ItemArtwork"

vi.mock("./ItemModelViewer", () => ({
  default: ({ src, mode }: { src: string; mode: string }) => (
    <div data-testid="item-model" data-src={src} data-mode={mode} />
  ),
}))

function render(ui: ReactElement) {
  return renderToStaticMarkup(<ChakraProvider value={system}>{ui}</ChakraProvider>)
}

describe("ItemArtwork model precedence", () => {
  it("renders the model viewer instead of the icon when the model resolves", () => {
    const html = render(<ItemArtwork shortId="cold-beer" model="model.glb" icon="Beer" />)
    expect(html).toContain('data-testid="item-model"')
    expect(html).toContain(
      'data-src="https://cdn.listeningroom.club/assets/items/cold-beer/model.glb"',
    )
    expect(html).toContain('data-mode="thumbnail"')
    expect(html).not.toContain("<svg")
  })

  it("keeps the Lucide icon when the model does not resolve", () => {
    const html = render(<ItemArtwork shortId="cold-beer" model="../model.glb" icon="Beer" />)
    expect(html).not.toContain('data-testid="item-model"')
    expect(html).toContain("<svg")
  })

  it("uses the stage only for interactive feature-sized artwork", () => {
    const stage = render(
      <ItemArtwork shortId="cold-beer" model="model.glb" size="feature" modelInteractive />,
    )
    expect(stage).toContain('data-mode="stage"')

    const rowFlag = render(<ItemArtwork shortId="cold-beer" model="model.glb" modelInteractive />)
    expect(rowFlag).toContain('data-mode="thumbnail"')
  })

  it("lets cover art win over the model", () => {
    const html = render(
      <ItemArtwork imageUrl="https://cdn.example/a.jpg" shortId="cold-beer" model="model.glb" />,
    )
    expect(html).not.toContain('data-testid="item-model"')
    expect(html).toContain("https://cdn.example/a.jpg")
  })
})
