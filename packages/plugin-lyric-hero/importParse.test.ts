import { describe, expect, it } from "vitest"
import { parseLyricPhrasesImport } from "./importParse"

describe("parseLyricPhrasesImport", () => {
  it("parses one phrase per line", () => {
    const rows = parseLyricPhrasesImport("don't stop believin'\njust a small town girl\n")
    expect(rows).toEqual([
      { text: "don't stop believin'" },
      { text: "just a small town girl" },
    ])
  })

  it("ignores blank lines and # comments", () => {
    const rows = parseLyricPhrasesImport(`
# Journey
don't stop believin'

# blank above
`)
    expect(rows).toEqual([{ text: "don't stop believin'" }])
  })

  it("strips leading list markers", () => {
    expect(parseLyricPhrasesImport("- hello world\n* second line\n1. third line\n2) fourth")).toEqual(
      [
        { text: "hello world" },
        { text: "second line" },
        { text: "third line" },
        { text: "fourth" },
      ],
    )
  })

  it("returns an empty array for empty paste", () => {
    expect(parseLyricPhrasesImport("")).toEqual([])
    expect(parseLyricPhrasesImport("\n\n# only comments\n")).toEqual([])
  })
})
