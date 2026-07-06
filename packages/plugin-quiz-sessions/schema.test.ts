import { describe, it, expect } from "vitest"
import { getConfigSchema } from "./schema"
import {
  quizSessionsConfigSchema,
  defaultQuizSessionsConfig,
  type QuizSessionsConfig,
} from "./types"

describe("quiz-sessions config schema", () => {
  it("generates a config schema without throwing (toJSONSchema)", () => {
    const schema = getConfigSchema()
    expect(schema.jsonSchema).toBeTypeOf("object")
    expect(schema.layout).toContain("questions")
  })

  it("declares the question bank as a PRIVATE object-array field (ADR 0068)", () => {
    const { fieldMeta } = getConfigSchema()
    const questions = fieldMeta.questions
    expect(questions.type).toBe("object-array")
    expect(questions.scope).toBe("private")
    expect(questions.itemFields?.map((f) => f.name)).toEqual(["text", "acceptedAnswers"])
    expect(questions.itemFields?.find((f) => f.name === "acceptedAnswers")?.meta.type).toBe(
      "string-array",
    )
  })

  it("defaults the question bank to an empty array", () => {
    expect(defaultQuizSessionsConfig.questions).toEqual([])
  })

  it("parses a config containing an authored question bank", () => {
    const parsed: QuizSessionsConfig = quizSessionsConfigSchema.parse({
      enabled: true,
      mode: "competitive",
      questions: [{ text: "What song is this?", acceptedAnswers: ["Blue Monday"] }],
    })
    expect(parsed.questions).toEqual([
      { text: "What song is this?", acceptedAnswers: ["Blue Monday"] },
    ])
  })

  it("applies item defaults for a bare question row", () => {
    const parsed = quizSessionsConfigSchema.parse({
      mode: "inclusive",
      questions: [{}],
    })
    expect(parsed.questions).toEqual([{ text: "", acceptedAnswers: [] }])
  })
})
