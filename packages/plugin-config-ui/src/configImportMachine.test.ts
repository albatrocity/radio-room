import { describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"
import { configImportMachine } from "./configImportMachine"

function start() {
  const actor = createActor(configImportMachine)
  actor.start()
  return actor
}

describe("configImportMachine", () => {
  it("opens and closes, resetting text", () => {
    const actor = start()
    actor.send({ type: "OPEN" })
    expect(actor.getSnapshot().matches("open")).toBe(true)

    actor.send({ type: "SET_TEXT", rawText: "hello" })
    expect(actor.getSnapshot().context.rawText).toBe("hello")

    actor.send({ type: "CLOSE" })
    expect(actor.getSnapshot().matches("closed")).toBe(true)
    expect(actor.getSnapshot().context.rawText).toBe("")
  })

  it("arms replace confirm then submits on second click", async () => {
    const run = vi.fn(async () => ({ success: true as const, value: [1], message: "ok" }))
    const actor = start()
    actor.send({ type: "OPEN" })
    actor.send({ type: "SET_TEXT", rawText: "Q?\n- a" })

    actor.send({
      type: "SUBMIT",
      mode: "replace",
      needsReplaceConfirm: true,
      run,
    })
    expect(actor.getSnapshot().matches("open")).toBe(true)
    expect(actor.getSnapshot().context.confirmReplace).toBe(true)
    expect(run).not.toHaveBeenCalled()

    actor.send({
      type: "SUBMIT",
      mode: "replace",
      needsReplaceConfirm: false,
      run,
    })
    expect(actor.getSnapshot().matches("submitting")).toBe(true)

    await vi.waitFor(() => expect(actor.getSnapshot().matches("closed")).toBe(true))
    expect(run).toHaveBeenCalledOnce()
  })

  it("appends without confirm and returns to closed on success", async () => {
    const run = vi.fn(async () => ({ success: true as const, value: [], message: "Appended" }))
    const actor = start()
    actor.send({ type: "OPEN" })
    actor.send({ type: "SET_TEXT", rawText: "Q?" })
    actor.send({ type: "SUBMIT", mode: "append", needsReplaceConfirm: false, run })

    await vi.waitFor(() => expect(actor.getSnapshot().matches("closed")).toBe(true))
    expect(run).toHaveBeenCalledOnce()
  })

  it("returns to open on apply failure", async () => {
    const run = vi.fn(async () => ({ success: false as const, message: "bad paste" }))
    const actor = start()
    actor.send({ type: "OPEN" })
    actor.send({ type: "SET_TEXT", rawText: "x" })
    actor.send({ type: "SUBMIT", mode: "append", needsReplaceConfirm: false, run })

    await vi.waitFor(() => expect(actor.getSnapshot().matches("open")).toBe(true))
    expect(actor.getSnapshot().context.rawText).toBe("x")
  })

  it("clears replace confirm when text changes", () => {
    const actor = start()
    actor.send({ type: "OPEN" })
    actor.send({
      type: "SUBMIT",
      mode: "replace",
      needsReplaceConfirm: true,
      run: async () => ({ success: true }),
    })
    expect(actor.getSnapshot().context.confirmReplace).toBe(true)

    actor.send({ type: "SET_TEXT", rawText: "changed" })
    expect(actor.getSnapshot().context.confirmReplace).toBe(false)
  })

  it("invokes provided reportSuccess with captured result on success", async () => {
    const applied: Array<{ value: unknown; message?: string }> = []
    const machine = configImportMachine.provide({
      actions: {
        reportSuccess: ({ context }) => {
          if (!context.lastResult) return
          applied.push({ value: context.lastResult.value, message: context.lastResult.message })
        },
      },
    })
    const actor = createActor(machine)
    actor.start()
    actor.send({ type: "OPEN" })
    actor.send({ type: "SET_TEXT", rawText: "Q?" })
    actor.send({
      type: "SUBMIT",
      mode: "append",
      needsReplaceConfirm: false,
      run: async () => ({ success: true, value: [1], message: "ok" }),
    })

    await vi.waitFor(() => expect(actor.getSnapshot().matches("closed")).toBe(true))
    expect(applied).toEqual([{ value: [1], message: "ok" }])
  })

  it("invokes provided reportError with captured message on failure", async () => {
    const errors: string[] = []
    const machine = configImportMachine.provide({
      actions: {
        reportError: ({ context }) => {
          if (context.lastError) errors.push(context.lastError)
        },
      },
    })
    const actor = createActor(machine)
    actor.start()
    actor.send({ type: "OPEN" })
    actor.send({ type: "SET_TEXT", rawText: "Q?" })
    actor.send({
      type: "SUBMIT",
      mode: "append",
      needsReplaceConfirm: false,
      run: async () => ({ success: false, message: "bad paste" }),
    })

    await vi.waitFor(() => expect(actor.getSnapshot().matches("open")).toBe(true))
    expect(errors).toEqual(["bad paste"])
  })
})
