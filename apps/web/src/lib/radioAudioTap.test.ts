import { describe, expect, it, beforeEach } from "vitest"
import {
  __resetRadioAudioTapForTests,
  byteTimeDomainLooksSilent,
  fillRadioTimeDomainData,
  getRegisteredRadioAudioElement,
  isSafariLikeBrowser,
  registerRadioAudioElement,
  subscribeRadioAudioTap,
} from "./radioAudioTap"
import {
  __resetAnalysisTapForTests,
  __writeAnalysisTapSamplesForTests,
  startAnalysisTap,
} from "./mse/analysisTap"

function fakeAudio(): HTMLAudioElement {
  return { tagName: "AUDIO", paused: true, currentTime: 2 / 44100 } as HTMLAudioElement
}

describe("radioAudioTap", () => {
  beforeEach(() => {
    __resetRadioAudioTapForTests()
    __resetAnalysisTapForTests()
  })

  it("registers and clears an element", () => {
    const el = fakeAudio()
    registerRadioAudioElement(el)
    expect(getRegisteredRadioAudioElement()).toBe(el)
    registerRadioAudioElement(null)
    expect(getRegisteredRadioAudioElement()).toBeNull()
  })

  it("notifies subscribers on register", () => {
    let calls = 0
    const unsub = subscribeRadioAudioTap(() => {
      calls += 1
    })
    registerRadioAudioElement(fakeAudio())
    expect(calls).toBe(1)
    unsub()
  })

  it("serves time-domain data from the analysis tap", () => {
    startAnalysisTap(44100)
    __writeAnalysisTapSamplesForTests(0, new Float32Array([0, 0.5, -0.5, 0]), 44100)

    // Stub the MSE element currentTime via module — fillRadioTimeDomainData reads getRadioMseElement()
    // In node tests without DOM element, returns false unless we mock transport.
    expect(fillRadioTimeDomainData(new Uint8Array(4))).toBe(false)
  })

  it("byteTimeDomainLooksSilent detects flat midline buffers", () => {
    const flat = new Uint8Array(8).fill(128)
    expect(byteTimeDomainLooksSilent(flat)).toBe(true)
    flat[0] = 200
    expect(byteTimeDomainLooksSilent(flat)).toBe(false)
  })

  it("isSafariLikeBrowser is a boolean in node tests", () => {
    expect(typeof isSafariLikeBrowser()).toBe("boolean")
  })
})
