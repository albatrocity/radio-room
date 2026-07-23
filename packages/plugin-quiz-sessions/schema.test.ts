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

  it("exposes session-lifecycle action buttons gated on enabled", () => {
    const actions = getConfigSchema().layout.filter(
      (el): el is Extract<typeof el, { type: "action" }> =>
        typeof el === "object" && (el as { type?: string }).type === "action",
    )
    expect(actions.map((a) => a.action)).toEqual([
      "importQuestions",
      "startSession",
      "advanceQuestion",
      "endSession",
      "updateReward",
    ])
    for (const action of actions) {
      expect(action.showWhen).toEqual({ field: "enabled", value: true })
    }
  })

  it("declares importQuestions as a configImport action with append/replace modes", () => {
    const actions = getConfigSchema().layout.filter(
      (el): el is Extract<typeof el, { type: "action" }> =>
        typeof el === "object" && (el as { type?: string }).type === "action",
    )
    const importAction = actions.find((a) => a.action === "importQuestions")
    expect(importAction?.configImport).toEqual({
      targetField: "questions",
      modes: ["append", "replace"],
      sourceParam: "rawText",
    })
    expect(importAction?.formFields?.[0]?.type).toBe("textarea")
    expect(getConfigSchema().quickAccess).toContain("importQuestions")
  })

  it("gives End quiz a confirm step and Set coin reward a coinReward form field", () => {
    const actions = getConfigSchema().layout.filter(
      (el): el is Extract<typeof el, { type: "action" }> =>
        typeof el === "object" && (el as { type?: string }).type === "action",
    )
    const end = actions.find((a) => a.action === "endSession")
    expect(end?.variant).toBe("destructive")
    expect(end?.confirmMessage).toBeTruthy()

    const reward = actions.find((a) => a.action === "updateReward")
    expect(reward?.formFields?.map((f) => f.name)).toEqual(["coinReward"])
    expect(reward?.formFields?.[0]?.required).toBe(true)
  })
})
