import { describe, expect, it } from "vitest"
import { parseLyricPhrasesImport } from "./importParse"

describe("parseLyricPhrasesImport", () => {
  it("parses one phrase per line", () => {
    const rows = parseLyricPhrasesImport("don't stop believin'\njust a small town girl\n")
    expect(rows).toEqual([
      { text: "don't stop believin'", hint: "" },
      { text: "just a small town girl", hint: "" },
    ])
  })

  it("ignores blank lines and # comments", () => {
    const rows = parseLyricPhrasesImport(`
# Journey
don't stop believin'

# blank above
`)
    expect(rows).toEqual([{ text: "don't stop believin'", hint: "" }])
  })

  it("strips leading list markers", () => {
    expect(parseLyricPhrasesImport("- hello world\n* second line\n1. third line\n2) fourth")).toEqual(
      [
        { text: "hello world", hint: "" },
        { text: "second line", hint: "" },
        { text: "third line", hint: "" },
        { text: "fourth", hint: "" },
      ],
    )
  })

  it("parses optional hint after | ", () => {
    expect(
      parseLyricPhrasesImport(
        "don't stop believin' | Journey, 1981\njust a small town girl\nliving in a lonely world | Steve Perry",
      ),
    ).toEqual([
      { text: "don't stop believin'", hint: "Journey, 1981" },
      { text: "just a small town girl", hint: "" },
      { text: "living in a lonely world", hint: "Steve Perry" },
    ])
  })

  it("returns an empty array for empty paste", () => {
    expect(parseLyricPhrasesImport("")).toEqual([])
    expect(parseLyricPhrasesImport("\n\n# only comments\n")).toEqual([])
  })
})
