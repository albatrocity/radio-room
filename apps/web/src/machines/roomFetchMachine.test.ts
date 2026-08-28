import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createActor } from "xstate"

vi.mock("../lib/socket", () => ({
  default: {
    io: { on: vi.fn(), off: vi.fn() },
    on: vi.fn(),
    off: vi.fn(),
  },
}))

vi.mock("../lib/serverApi", () => ({
  findRoom: vi.fn(),
}))

vi.mock("../actors/socketActor", () => ({
  emitToSocket: vi.fn(),
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
}))

vi.mock("../actors/pollActor", () => ({
  getLastPollChange: vi.fn(),
}))

vi.mock("../actors/audioActor", () => ({
  audioActor: { send: vi.fn(), getSnapshot: () => ({ context: {} }) },
}))

vi.mock("../actors/chatActor", () => ({
  chatActor: { getSnapshot: () => ({ context: { messages: [] } }) },
}))

vi.mock("../actors/playlistActor", () => ({
  playlistActor: { getSnapshot: () => ({ context: { playlist: [] } }) },
}))

import { findRoom } from "../lib/serverApi"
import {
  ROOM_EXPIRED_MESSAGE,
  ROOM_MISSING_REDIRECT_MS,
  roomFetchMachine,
} from "./roomFetchMachine"

const mockedFindRoom = vi.mocked(findRoom)

function httpError(status: number) {
  return { response: { status: status } }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("roomFetchMachine missing-room redirect", () => {
  const replace = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    replace.mockReset()
    mockedFindRoom.mockReset()
    vi.stubGlobal("window", { location: { replace } })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("shows the expired-room message and redirects home after 10 seconds", () => {
    const actor = createActor(roomFetchMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({ type: "ROOM_DELETED" })

    expect(actor.getSnapshot().matches({ active: "deleted" })).toBe(true)
    expect(actor.getSnapshot().context.error).toEqual({
      message: ROOM_EXPIRED_MESSAGE,
      status: 404,
    })

    vi.advanceTimersByTime(ROOM_MISSING_REDIRECT_MS - 1)
    expect(replace).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(replace).toHaveBeenCalledWith("/")
    expect(actor.getSnapshot().matches({ active: "redirecting" })).toBe(true)

    actor.stop()
  })

  it("shows Room not found and redirects home after 10 seconds", async () => {
    mockedFindRoom.mockRejectedValue(httpError(404))
    const actor = createActor(roomFetchMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({ type: "FETCH", data: { id: "missing-room" } })

    await flushMicrotasks()
    expect(actor.getSnapshot().matches({ active: "deleted" })).toBe(true)
    expect(actor.getSnapshot().context.error).toEqual({
      message: "Room not found.",
      status: 404,
    })

    vi.advanceTimersByTime(ROOM_MISSING_REDIRECT_MS - 1)
    expect(replace).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(replace).toHaveBeenCalledWith("/")
    expect(actor.getSnapshot().matches({ active: "redirecting" })).toBe(true)

    actor.stop()
  })

  it("does not redirect on other fetch errors", async () => {
    mockedFindRoom.mockRejectedValue(httpError(500))
    const actor = createActor(roomFetchMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({ type: "FETCH", data: { id: "broken-room" } })

    await flushMicrotasks()
    expect(actor.getSnapshot().matches({ active: "error" })).toBe(true)
    vi.advanceTimersByTime(ROOM_MISSING_REDIRECT_MS)
    expect(replace).not.toHaveBeenCalled()

    actor.stop()
  })

  it("cancels the redirect if the room is deactivated first", () => {
    const actor = createActor(roomFetchMachine).start()
    actor.send({ type: "ACTIVATE" })
    actor.send({ type: "ROOM_DELETED" })
    actor.send({ type: "DEACTIVATE" })

    vi.advanceTimersByTime(ROOM_MISSING_REDIRECT_MS)
    expect(replace).not.toHaveBeenCalled()
    expect(actor.getSnapshot().matches("idle")).toBe(true)

    actor.stop()
  })
})
