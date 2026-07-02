import { describe, expect, it } from "vitest"
import { markdownToSanitizedHtml } from "./render"

describe("markdownToSanitizedHtml", () => {
  it("adds inline styles and email classes to headings and paragraphs", () => {
    const html = markdownToSanitizedHtml("# Hello\n\nParagraph text with [link](https://example.com).")

    expect(html).toContain('class="email-heading"')
    expect(html).toContain('class="email-text"')
    expect(html).toContain('class="email-link"')
    expect(html).toContain('style="')
    expect(html).toContain('font-size:24px')
    expect(html).toContain('href="https://example.com"')
  })

  it("styles lists and code blocks", () => {
    const html = markdownToSanitizedHtml("- one\n- two\n\n`inline`")

    expect(html).toContain("<ul")
    expect(html).toContain('class="email-code"')
  })
})
