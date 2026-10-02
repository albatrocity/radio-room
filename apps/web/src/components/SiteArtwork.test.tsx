import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { ChakraProvider } from "@chakra-ui/react"
import { renderToStaticMarkup } from "react-dom/server"
import { system } from "../theme/chakraTheme"
import SiteArtwork from "./SiteArtwork"

vi.mock("./AppModelViewer", () => ({
  default: ({ src, mode }: { src: string; mode: string }) => (
    <div data-testid="site-model" data-src={src} data-mode={mode} />
  ),
}))

function render(ui: ReactElement) {
  return renderToStaticMarkup(<ChakraProvider value={system}>{ui}</ChakraProvider>)
}

const MODEL = "https://cdn.listeningroom.club/assets/maps/sites/stand.glb"
const IMAGE = "https://cdn.listeningroom.club/assets/maps/sites/stand.webp"

describe("SiteArtwork", () => {
  it("puts the 3D stage ahead of the image once there is a model", () => {
    const html = render(<SiteArtwork name="Stand" icon="🍎" imageUrl={IMAGE} modelUrl={MODEL} />)
    expect(html).toContain(`data-src="${MODEL}"`)
    expect(html).toContain('data-mode="stage"')
    expect(html).not.toContain("<img")
  })

  it("shows the image without a model, and nothing without art", () => {
    expect(render(<SiteArtwork name="Stand" icon="🍎" imageUrl={IMAGE} />)).toContain(
      `src="${IMAGE}"`,
    )
    const bare = render(<SiteArtwork name="Stand" icon="🍎" />)
    expect(bare).not.toContain("<img")
    expect(bare).not.toContain("site-model")
  })
})
