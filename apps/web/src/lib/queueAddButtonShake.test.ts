import { afterEach, describe, expect, it, vi } from "vitest"
import { PLAYBACK_DEVICE_MISSING_REASON } from "@repo/types"
import {
  armQueueAddButtonShake,
  disarmQueueAddButtonShake,
  shakeArmedQueueAddButtonIfPlaybackMissing,
} from "./queueAddButtonShake"

const applyAnimation = vi.hoisted(() =>
  vi.fn((_element: HTMLElement, _effect: string, _duration?: number) => Promise.resolve()),
)
const areAnimationsEnabled = vi.hoisted(() => vi.fn(() => true))

vi.mock("./screenEffects", () => ({
  applyAnimation: (element: HTMLElement, effect: string, duration?: number) =>
    applyAnimation(element, effect, duration),
}))

vi.mock("../actors/reducedMotionActor", () => ({
  areAnimationsEnabled: () => areAnimationsEnabled(),
}))

function fakeButton(): HTMLElement {
  return {} as HTMLElement
}

describe("queueAddButtonShake", () => {
  afterEach(() => {
    disarmQueueAddButtonShake()
    applyAnimation.mockClear()
    areAnimationsEnabled.mockReturnValue(true)
  })

  it("shakes the armed button on the playback-device failure", async () => {
    const button = fakeButton()
    armQueueAddButtonShake(button)
    await shakeArmedQueueAddButtonIfPlaybackMissing(PLAYBACK_DEVICE_MISSING_REASON)
    expect(applyAnimation).toHaveBeenCalledWith(button, "headShake", 600)
  })

  it("does not shake for other queue failures", async () => {
    const button = fakeButton()
    armQueueAddButtonShake(button)
    await shakeArmedQueueAddButtonIfPlaybackMissing("That track is already in the queue")
    expect(applyAnimation).not.toHaveBeenCalled()
  })

  it("skips the animation when motion is reduced", async () => {
    areAnimationsEnabled.mockReturnValue(false)
    const button = fakeButton()
    armQueueAddButtonShake(button)
    await shakeArmedQueueAddButtonIfPlaybackMissing(PLAYBACK_DEVICE_MISSING_REASON)
    expect(applyAnimation).not.toHaveBeenCalled()
  })

  it("clears the armed button so a later shake is a no-op", async () => {
    const button = fakeButton()
    armQueueAddButtonShake(button)
    disarmQueueAddButtonShake()
    await shakeArmedQueueAddButtonIfPlaybackMissing(PLAYBACK_DEVICE_MISSING_REASON)
    expect(applyAnimation).not.toHaveBeenCalled()
  })
})
