import { describe, expect, it, beforeEach } from "vitest"
import {
  __resetRadioAudioTapForTests,
  analyserLooksSilent,
  byteTimeDomainLooksSilent,
  getRegisteredRadioAudioElement,
  isSafariLikeBrowser,
  registerRadioAudioElement,
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

  it("analyserLooksSilent detects flat midline buffers", () => {
    const flat = {
      fftSize: 8,
      getByteTimeDomainData: (buf: Uint8Array) => {
        buf.fill(128)
      },
    } as AnalyserNode
    expect(analyserLooksSilent(flat)).toBe(true)

    const lively = {
      fftSize: 8,
      getByteTimeDomainData: (buf: Uint8Array) => {
        buf[0] = 200
        buf.fill(128, 1)
      },
    } as AnalyserNode
    expect(analyserLooksSilent(lively)).toBe(false)
  })

  it("byteTimeDomainLooksSilent matches analyserLooksSilent semantics", () => {
    const flat = new Uint8Array(8).fill(128)
    expect(byteTimeDomainLooksSilent(flat)).toBe(true)
    flat[0] = 200
    expect(byteTimeDomainLooksSilent(flat)).toBe(false)
  })

  it("isSafariLikeBrowser is a boolean in node tests", () => {
    expect(typeof isSafariLikeBrowser()).toBe("boolean")
  })
})
