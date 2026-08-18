import { describe, expect, it } from "vitest"
import { splitTextWithHttpUrls } from "./splitTextWithHttpUrls"

describe("splitTextWithHttpUrls", () => {
  it("returns a single text part when there is no URL", () => {
    expect(splitTextWithHttpUrls("A CD from the Record Store.")).toEqual([
      { type: "text", value: "A CD from the Record Store." },
    ])
  })

  it("splits multiple http(s) URLs from surrounding text", () => {
    expect(
      splitTextWithHttpUrls(
        "See https://www.discogs.com/release/123 and http://example.com/x",
      ),
    ).toEqual([
      { type: "text", value: "See " },
      { type: "url", value: "https://www.discogs.com/release/123" },
      { type: "text", value: " and " },
      { type: "url", value: "http://example.com/x" },
    ])
  })

  it("strips trailing punctuation from the href", () => {
    expect(splitTextWithHttpUrls("Buy it: https://bandcamp.com/album/foo.")).toEqual([
      { type: "text", value: "Buy it: " },
      { type: "url", value: "https://bandcamp.com/album/foo" },
      { type: "text", value: "." },
    ])
    expect(splitTextWithHttpUrls("(https://example.com/a)")).toEqual([
      { type: "text", value: "(" },
      { type: "url", value: "https://example.com/a" },
      { type: "text", value: ")" },
    ])
    expect(splitTextWithHttpUrls("https://example.com/a, next")).toEqual([
      { type: "url", value: "https://example.com/a" },
      { type: "text", value: ", next" },
    ])
    expect(splitTextWithHttpUrls("[https://example.com/a]")).toEqual([
      { type: "text", value: "[" },
      { type: "url", value: "https://example.com/a" },
      { type: "text", value: "]" },
    ])
  })

  it("does not treat scheme-less text as a URL", () => {
    expect(splitTextWithHttpUrls("www.example.com and javascript:alert(1)")).toEqual([
      { type: "text", value: "www.example.com and javascript:alert(1)" },
    ])
  })
})
