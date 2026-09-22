import { describe, expect, it } from "vitest"
import { validateItemUseFormValues } from "./validateItemUseForm"
import type { PluginActionFormField } from "@repo/types"

const kickstarterForm: PluginActionFormField[] = [
  { name: "title", label: "Campaign title", type: "string", required: true },
  { name: "goal", label: "Goal (coin)", type: "number", required: true, integer: true, min: 1 },
  { name: "rewards", label: "Backer rewards", type: "textarea", required: true },
]

describe("validateItemUseFormValues", () => {
  it("accepts and coerces valid kickstarter fields", () => {
    const result = validateItemUseFormValues(kickstarterForm, {
      title: " My project ",
      goal: "50",
      rewards: "A thank-you",
      extra: "drop-me",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.formValues).toEqual({
      title: " My project ",
      goal: 50,
      rewards: "A thank-you",
    })
  })

  it("rejects a missing required field", () => {
    const result = validateItemUseFormValues(kickstarterForm, {
      title: "x",
      goal: 10,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.result.consumed).toBe(false)
    expect(result.result.message).toMatch(/Backer rewards/)
  })

  it("rejects a non-integer when integer is required", () => {
    const result = validateItemUseFormValues(kickstarterForm, {
      title: "x",
      goal: 1.5,
      rewards: "y",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.result.message).toMatch(/whole number/)
  })

  it("rejects below min", () => {
    const result = validateItemUseFormValues(kickstarterForm, {
      title: "x",
      goal: 0,
      rewards: "y",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.result.message).toMatch(/at least 1/)
  })

  it("clamps long strings when maxLength is unset", () => {
    const long = "a".repeat(3000)
    const result = validateItemUseFormValues(
      [{ name: "note", label: "Note", type: "string", required: true }],
      { note: long },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.formValues.note as string).length).toBe(2000)
  })

  it("rejects strings over declared maxLength without trimming", () => {
    const result = validateItemUseFormValues(
      [{ name: "message", label: "Message", type: "textarea", required: true, maxLength: 100 }],
      { message: "x".repeat(101) },
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.result.consumed).toBe(false)
    expect(result.result.message).toMatch(/at most 100 characters/)
    expect(result.result.message).not.toMatch(/x{10}/)
  })

  it("accepts strings at declared maxLength", () => {
    const message = "x".repeat(100)
    const result = validateItemUseFormValues(
      [{ name: "message", label: "Message", type: "string", required: true, maxLength: 100 }],
      { message },
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.formValues.message).toBe(message)
  })

  it("accepts password as a string and never echoes the value in errors", () => {
    const secret = "hunter2-secret-value"
    const accepted = validateItemUseFormValues(
      [{ name: "password", label: "Password", type: "password", required: true }],
      { password: secret },
    )
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.formValues.password).toBe(secret)

    const missing = validateItemUseFormValues(
      [{ name: "password", label: "Password", type: "password", required: true }],
      { password: "   " },
    )
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.result.message).toMatch(/Password/)
    expect(missing.result.message).not.toContain(secret)

    const tooLong = validateItemUseFormValues(
      [
        {
          name: "password",
          label: "Password",
          type: "password",
          required: true,
          maxLength: 8,
        },
      ],
      { password: "toolongpassword" },
    )
    expect(tooLong.ok).toBe(false)
    if (tooLong.ok) return
    expect(tooLong.result.message).toMatch(/at most 8 characters/)
    expect(tooLong.result.message).not.toContain("toolongpassword")
  })

  it("accepts optionsSource select values without validating membership", () => {
    const fields: PluginActionFormField[] = [
      {
        name: "voice",
        label: "Voice",
        type: "select",
        required: true,
        optionsSource: "mediaBridgeVoices",
      },
    ]
    const result = validateItemUseFormValues(fields, {
      voice: "com.apple.voice.not-on-any-static-list",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.formValues.voice).toBe("com.apple.voice.not-on-any-static-list")
  })

  it("does not enforce maxFrom coinBalance on the server", () => {
    const fields: PluginActionFormField[] = [
      {
        name: "coinAmount",
        label: "Coins",
        type: "number",
        required: true,
        integer: true,
        min: 1,
        maxFrom: "coinBalance",
      },
    ]
    const result = validateItemUseFormValues(fields, { coinAmount: 999_999 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.formValues.coinAmount).toBe(999_999)
  })
})
