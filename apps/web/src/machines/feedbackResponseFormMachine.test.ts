import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"
import { createFeedbackResponseFormMachine } from "./feedbackResponseFormMachine"

describe("feedbackResponseFormMachine", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("saves vote immediately without waiting for debounce", () => {
    const onSave = vi.fn()
    const actor = createActor(
      createFeedbackResponseFormMachine({
        topicId: "t1",
        vote: null,
        comment: "",
        onSave,
      }),
    ).start()

    actor.send({ type: "SET_VOTE", vote: "up" })
    expect(onSave).toHaveBeenCalledWith({ topicId: "t1", vote: "up" })
    expect(actor.getSnapshot().context.vote).toBe("up")
  })

  it("debounces comment saves including empty string", () => {
    const onSave = vi.fn()
    const actor = createActor(
      createFeedbackResponseFormMachine({
        topicId: "t1",
        vote: "up",
        comment: "hello",
        onSave,
      }),
    ).start()

    actor.send({ type: "SET_COMMENT", comment: "hel" })
    actor.send({ type: "SET_COMMENT", comment: "" })
    expect(onSave).not.toHaveBeenCalled()
    vi.advanceTimersByTime(450)
    expect(onSave).toHaveBeenCalledWith({ topicId: "t1", comment: "" })
  })

  it("FLUSH commits dirty comment early", () => {
    const onSave = vi.fn()
    const actor = createActor(
      createFeedbackResponseFormMachine({
        topicId: "t1",
        vote: "down",
        comment: "",
        onSave,
      }),
    ).start()

    actor.send({ type: "SET_COMMENT", comment: "bug report" })
    actor.send({ type: "FLUSH" })
    expect(onSave).toHaveBeenCalledWith({ topicId: "t1", comment: "bug report" })
  })

  it("keeps comment when vote changes", () => {
    const onSave = vi.fn()
    const actor = createActor(
      createFeedbackResponseFormMachine({
        topicId: "t1",
        vote: "up",
        comment: "keep me",
        onSave,
      }),
    ).start()

    actor.send({ type: "SET_VOTE", vote: "down" })
    expect(actor.getSnapshot().context.comment).toBe("keep me")
    expect(onSave).toHaveBeenCalledWith({ topicId: "t1", vote: "down" })
  })

  it("allows general comment without a vote", () => {
    const onSave = vi.fn()
    const actor = createActor(
      createFeedbackResponseFormMachine({
        topicId: "general",
        vote: null,
        comment: "",
        allowCommentWithoutVote: true,
        onSave,
      }),
    ).start()

    actor.send({ type: "SET_COMMENT", comment: "bug report" })
    vi.advanceTimersByTime(450)
    expect(onSave).toHaveBeenCalledWith({
      topicId: "general",
      comment: "bug report",
    })
  })

  it("blocks comment without vote on named topics", () => {
    const onSave = vi.fn()
    const actor = createActor(
      createFeedbackResponseFormMachine({
        topicId: "t1",
        vote: null,
        comment: "",
        onSave,
      }),
    ).start()

    actor.send({ type: "SET_COMMENT", comment: "nope" })
    vi.advanceTimersByTime(450)
    expect(onSave).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.comment).toBe("")
  })
})
