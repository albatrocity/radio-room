import { describe, expect, it, beforeEach } from "vitest"
import {
  __resetRadioAudioTapForTests,
  byteTimeDomainLooksSilent,
  fillRadioTimeDomainData,
  getRadioStreamAnalyser,
  getRegisteredRadioAudioElement,
  isSafariLikeBrowser,
  registerRadioAudioElement,
  registerRadioStreamAnalyser,
  subscribeRadioAudioTap,
} from "./radioAudioTap"

function fakeAudio(): HTMLAudioElement {
  return { tagName: "AUDIO", paused: true } as HTMLAudioElement
}

describe("radioAudioTap", () => {
  beforeEach(() => {
    __resetRadioAudioTapForTests()
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
    const el = fakeAudio()
    registerRadioAudioElement(el)
    expect(calls).toBe(1)
    registerRadioAudioElement(null)
    expect(calls).toBe(2)
    unsub()
    registerRadioAudioElement(el)
    expect(calls).toBe(2)
  })

  it("does not notify when re-registering the same element", () => {
    let calls = 0
    const unsub = subscribeRadioAudioTap(() => {
      calls += 1
    })
    const el = fakeAudio()
    registerRadioAudioElement(el)
    registerRadioAudioElement(el)
    expect(calls).toBe(1)
    unsub()
  })

  it("serves time-domain data from the registered stream analyser", () => {
    expect(getRadioStreamAnalyser()).toBeNull()
    expect(fillRadioTimeDomainData(new Uint8Array(8))).toBe(false)

    const node = {
      fftSize: 8,
      getByteTimeDomainData: (buf: Uint8Array) => {
        buf.fill(128)
        buf[0] = 200
      },
    } as AnalyserNode
    registerRadioStreamAnalyser(node)
    expect(getRadioStreamAnalyser()).toBe(node)

    const out = new Uint8Array(8)
    expect(fillRadioTimeDomainData(out)).toBe(true)
    expect(out[0]).toBe(200)
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
