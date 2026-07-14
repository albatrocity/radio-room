import { describe, expect, it } from "vitest"
import { markdownToSanitizedHtml, renderConfirmEmail, renderNewsletter } from "./render"

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

describe("renderNewsletter", () => {
  it("includes the CDN logo when logoUrl is provided", async () => {
    const logoUrl = "https://cdn.example.com/assets/logo.png"
    const html = await renderNewsletter({
      subject: "Hello",
      bodyMarkdown: "Body",
      unsubscribeUrl: "https://example.com/unsubscribe",
      logoUrl,
    })

    expect(html).toContain(`src="${logoUrl}"`)
    expect(html).toContain('alt="Listening Room"')
  })

  it("omits the logo image when logoUrl is not provided", async () => {
    const html = await renderNewsletter({
      subject: "Hello",
      bodyMarkdown: "Body",
      unsubscribeUrl: "https://example.com/unsubscribe",
    })

    expect(html).not.toContain('alt="Listening Room"')
    expect(html).toContain("Listening Room")
  })
})

describe("renderConfirmEmail", () => {
  it("includes the CDN logo when logoUrl is provided", async () => {
    const logoUrl = "https://cdn.example.com/assets/logo.png"
    const html = await renderConfirmEmail({
      confirmUrl: "https://example.com/confirm",
      logoUrl,
    })

    expect(html).toContain(`src="${logoUrl}"`)
    expect(html).toContain('alt="Listening Room"')
  })
})
