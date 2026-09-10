import type { ReactElement } from "react"
import { describe, expect, it } from "vitest"
import { ChakraProvider } from "@chakra-ui/react"
import { renderToStaticMarkup } from "react-dom/server"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { MessageSegments } from "./MessageSegments"
import { system } from "../theme/chakraTheme"

function renderChatMarkdown(ui: ReactElement) {
  return renderToStaticMarkup(<ChakraProvider value={system}>{ui}</ChakraProvider>)
}

describe("ParsedEmojiMessage", () => {
  it("renders *italic* as em with italic styling", () => {
    const html = renderChatMarkdown(<ParsedEmojiMessage content="*italic*" />)
    expect(html).toMatch(/<em[^>]*>italic<\/em>/)
    expect(html).toContain("font-style:italic")
    expect(html).not.toContain("*italic*")
  })

  it("renders **bold** as strong with semibold weight", () => {
    const html = renderChatMarkdown(<ParsedEmojiMessage content="**bold**" />)
    expect(html).toMatch(/<strong[^>]*>bold<\/strong>/)
    expect(html).toMatch(/font-weight:(var\(--chakra-font-weights-semibold\)|semibold|600)/)
    expect(html).not.toContain("**bold**")
  })

  it("nests em and strong for ***both***", () => {
    const html = renderChatMarkdown(<ParsedEmojiMessage content="***both***" />)
    // GFM commonly emits em>strong (or strong>em); accept either nesting.
    expect(html).toMatch(
      /(<em[^>]*>[\s\S]*<strong[^>]*>both<\/strong>[\s\S]*<\/em>)|(<strong[^>]*>[\s\S]*<em[^>]*>both<\/em>[\s\S]*<\/strong>)/,
    )
    expect(html).toContain("font-style:italic")
    expect(html).toMatch(/font-weight:(var\(--chakra-font-weights-semibold\)|semibold|600)/)
  })
})

describe("MessageSegments markdown across word splits", () => {
  it("emphasizes multi-word marks split across same-effect pieces", () => {
    const html = renderChatMarkdown(
      <MessageSegments
        segments={[{ text: "*hello " }, { text: "world*" }]}
      />,
    )
    expect(html).toMatch(/<em[^>]*>hello world<\/em>/)
    expect(html).not.toContain("*hello")
    expect(html).not.toContain("world*")
  })
})
