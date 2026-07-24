import { describe, expect, it } from "vitest"
import { parseQuizQuestionsImport } from "./importParse"

const SAMPLE = `This is the first question. What are viable answers?

- acceptable answer 1
- acceptable answer 2
- acceptable answer 3

This is the second question: who created this feature?

- Claude
- Grok
- Gemini

This is the third question: what is the best answer?

- best answer 1
- best answer 2
- best answer 3

This is the fourth question: what is the worst answer?

- worst answer 1
- worst answer 2
- worst answer 3
`

describe("parseQuizQuestionsImport", () => {
  it("parses the sample four-question paste", () => {
    const rows = parseQuizQuestionsImport(SAMPLE)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toEqual({
      text: "This is the first question. What are viable answers?",
      acceptedAnswers: ["acceptable answer 1", "acceptable answer 2", "acceptable answer 3"],
    })
    expect(rows[1].acceptedAnswers).toEqual(["Claude", "Grok", "Gemini"])
    expect(rows[3].text).toBe("This is the fourth question: what is the worst answer?")
  })

  it("supports asterisk bullets", () => {
    const rows = parseQuizQuestionsImport(`Q one

* a
* b
`)
    expect(rows).toEqual([{ text: "Q one", acceptedAnswers: ["a", "b"] }])
  })

  it("ignores orphan bullets before any question", () => {
    expect(parseQuizQuestionsImport(`- orphan\n\nReal Q?\n- ans`)).toEqual([
      { text: "Real Q?", acceptedAnswers: ["ans"] },
    ])
  })

  it("allows questions with no answers", () => {
    expect(parseQuizQuestionsImport("Just a question?")).toEqual([
      { text: "Just a question?", acceptedAnswers: [] },
    ])
  })

  it("collapses multi-line preambles", () => {
    const rows = parseQuizQuestionsImport(`Line one
Line two

- ans
`)
    expect(rows[0].text).toBe("Line one Line two")
    expect(rows[0].acceptedAnswers).toEqual(["ans"])
  })
})
