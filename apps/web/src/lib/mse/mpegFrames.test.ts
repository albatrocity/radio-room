import { describe, expect, it } from "vitest"
import { buildTestMpegFrame, splitMpegFrames } from "./mpegFrames"

function concatFrames(frames: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = frames.reduce((sum, frame) => sum + frame.length, 0)
  const out = new Uint8Array(total) as Uint8Array<ArrayBuffer>
  let offset = 0
  for (const frame of frames) {
    out.set(frame, offset)
    offset += frame.length
  }
  return out
}

describe("splitMpegFrames", () => {
  it("splits back-to-back MPEG1 Layer III frames", () => {
    const frames = Array.from({ length: 200 }, () => buildTestMpegFrame())
    const input = concatFrames(frames)
    const { frames: parsed, remainder } = splitMpegFrames(input)

    expect(parsed).toHaveLength(200)
    expect(remainder.length).toBe(0)
    expect(parsed[0]?.durationSec).toBeCloseTo(1152 / 44100, 5)
    expect(parsed[0]?.sampleRate).toBe(44100)
    expect(parsed[0]?.bytes.length).toBe(frames[0]?.length)
  })

  it("returns a remainder when the last frame is incomplete", () => {
    const full = buildTestMpegFrame()
    const partial = full.subarray(0, 40) as Uint8Array<ArrayBuffer>
    const input = concatFrames([full, partial])
    const { frames, remainder } = splitMpegFrames(input)

    expect(frames).toHaveLength(1)
    expect(remainder.length).toBe(40)
  })

  it("skips an ID3v2 tag prefix", () => {
    const tag = new Uint8Array(10 + 20) as Uint8Array<ArrayBuffer>
    tag[0] = 0x49
    tag[1] = 0x44
    tag[2] = 0x33
    tag[6] = 0
    tag[7] = 0
    tag[8] = 0
    tag[9] = 20
    const frame = buildTestMpegFrame()
    const input = new Uint8Array(tag.length + frame.length) as Uint8Array<ArrayBuffer>
    input.set(tag, 0)
    input.set(frame, tag.length)

    const { frames, remainder } = splitMpegFrames(input)
    expect(frames).toHaveLength(1)
    expect(remainder.length).toBe(0)
  })

  it("carries remainder across chunked reads", () => {
    const frames = Array.from({ length: 5 }, () => buildTestMpegFrame())
    const input = concatFrames(frames)
    const mid = Math.floor(input.length / 2)

    const first = splitMpegFrames(input.subarray(0, mid) as Uint8Array<ArrayBuffer>)
    const combined = new Uint8Array(first.remainder.length + (input.length - mid)) as Uint8Array<ArrayBuffer>
    combined.set(first.remainder, 0)
    combined.set(input.subarray(mid), first.remainder.length)
    const second = splitMpegFrames(combined)

    expect(first.frames.length + second.frames.length).toBe(5)
    expect(second.remainder.length).toBe(0)
  })
})
