import { afterEach, describe, expect, it, vi } from "vitest"
import { PLAYBACK_DEVICE_MISSING_REASON } from "@repo/types"
import {
  armQueueAddButtonShake,
  disarmQueueAddButtonShake,
  shakeArmedQueueAddButtonIfPlaybackMissing,
} from "./queueAddButtonShake"

const playNamedAnimation = vi.hoisted(() =>
  vi.fn((_element: HTMLElement, _name: string) => Promise.resolve()),
)

vi.mock("./inventoryItemAnimations", () => ({
  playNamedAnimation: (element: HTMLElement, name: string) => playNamedAnimation(element, name),
}))

function fakeButton(): HTMLElement {
  return {} as HTMLElement
}

describe("queueAddButtonShake", () => {
  afterEach(() => {
    disarmQueueAddButtonShake()
    playNamedAnimation.mockClear()
  })

  it("shakes the armed button on the playback-device failure", async () => {
    const button = fakeButton()
    armQueueAddButtonShake(button)
    await shakeArmedQueueAddButtonIfPlaybackMissing(PLAYBACK_DEVICE_MISSING_REASON)
    expect(playNamedAnimation).toHaveBeenCalledWith(button, "headShake")
  })

  it("does not shake for other queue failures", async () => {
    const button = fakeButton()
    armQueueAddButtonShake(button)
    await shakeArmedQueueAddButtonIfPlaybackMissing("That track is already in the queue")
    expect(playNamedAnimation).not.toHaveBeenCalled()
  })

  it("clears the armed button so a later shake is a no-op", async () => {
    const button = fakeButton()
    armQueueAddButtonShake(button)
    disarmQueueAddButtonShake()
    await shakeArmedQueueAddButtonIfPlaybackMissing(PLAYBACK_DEVICE_MISSING_REASON)
    expect(playNamedAnimation).not.toHaveBeenCalled()
  })
})
