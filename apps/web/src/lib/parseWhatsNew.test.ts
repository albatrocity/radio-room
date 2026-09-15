import { describe, expect, it } from "vitest"
import { latestWhatsNewMonthId, parseWhatsNew } from "./parseWhatsNew"

describe("parseWhatsNew", () => {
  it("returns empty for empty / comment-only input", () => {
    expect(parseWhatsNew("")).toEqual([])
    expect(parseWhatsNew("<!-- just a comment -->\n\n")).toEqual([])
  })

  it("parses month headings and preserves order", () => {
    const raw = `
## October 2026

### New
- Later stuff

## September 2026

Intro line.

### New
- Earlier stuff

### Fixed
- A fix
`
    const months = parseWhatsNew(raw)
    expect(months).toHaveLength(2)
    expect(months[0]).toMatchObject({
      id: "2026-10",
      heading: "October 2026",
    })
    expect(months[0]!.bodyMarkdown).toContain("Later stuff")
    expect(months[1]).toMatchObject({
      id: "2026-09",
      heading: "September 2026",
    })
    expect(months[1]!.bodyMarkdown).toContain("Intro line.")
    expect(months[1]!.bodyMarkdown).toContain("### Fixed")
  })

  it("keeps intro text under the month heading in bodyMarkdown", () => {
    const months = parseWhatsNew(`## September 2026

Recap of what’s landed.

### New
- One feature
`)
    expect(months[0]!.bodyMarkdown.startsWith("Recap")).toBe(true)
    expect(months[0]!.bodyMarkdown).toContain("### New")
  })

  it("ignores non-month ## headings", () => {
    const months = parseWhatsNew(`## Not A Month

## September 2026

### New
- Real
`)
    expect(months).toHaveLength(1)
    expect(months[0]!.id).toBe("2026-09")
  })

  it("normalizes mixed-case month names", () => {
    const months = parseWhatsNew("## september 2026\n\n- hi\n")
    expect(months[0]).toMatchObject({ id: "2026-09", heading: "September 2026" })
  })
})

describe("latestWhatsNewMonthId", () => {
  it("returns the first month id", () => {
    expect(
      latestWhatsNewMonthId([
        { id: "2026-10", heading: "October 2026", bodyMarkdown: "" },
        { id: "2026-09", heading: "September 2026", bodyMarkdown: "" },
      ]),
    ).toBe("2026-10")
  })

  it("returns null when empty", () => {
    expect(latestWhatsNewMonthId([])).toBeNull()
  })
})
