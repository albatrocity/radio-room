/**
 * MP3 frame splitter for MSE append. Only whole Layer III frames are returned.
 */

export type MpegFrame = {
  bytes: Uint8Array<ArrayBuffer>
  durationSec: number
  sampleRate: number
}

const MPEG1_L3_BITRATE_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const MPEG2_L3_BITRATE_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
const MPEG1_SAMPLE_RATE = [44100, 48000, 32000]
const MPEG2_SAMPLE_RATE = [22050, 24000, 16000]
const MPEG25_SAMPLE_RATE = [11025, 12000, 8000]

type FrameHeader = {
  frameLength: number
  durationSec: number
  sampleRate: number
}

function skipId3v2(data: Uint8Array, offset: number): number {
  if (offset + 10 > data.length) return offset
  if (data[offset] !== 0x49 || data[offset + 1] !== 0x44 || data[offset + 2] !== 0x33) {
    return offset
  }
  const size =
    ((data[offset + 6] & 0x7f) << 21) |
    ((data[offset + 7] & 0x7f) << 14) |
    ((data[offset + 8] & 0x7f) << 7) |
    (data[offset + 9] & 0x7f)
  return offset + 10 + size
}

function readFrameHeader(data: Uint8Array, offset: number): FrameHeader | null {
  if (offset + 4 > data.length) return null
  if (data[offset] !== 0xff || (data[offset + 1] & 0xe0) !== 0xe0) return null

  const b1 = data[offset + 1]
  const b2 = data[offset + 2]

  const versionBits = (b1 >> 3) & 0x03
  if (versionBits === 1) return null
  const layerBits = (b1 >> 1) & 0x03
  if (layerBits !== 1) return null // Layer III only

  const bitrateIndex = (b2 >> 4) & 0x0f
  const sampleRateIndex = (b2 >> 2) & 0x03
  const padding = (b2 >> 1) & 0x01
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null

  let bitrateKbps: number
  let sampleRate: number
  let samplesPerFrame: number
  let frameLength: number

  if (versionBits === 3) {
    bitrateKbps = MPEG1_L3_BITRATE_KBPS[bitrateIndex]!
    sampleRate = MPEG1_SAMPLE_RATE[sampleRateIndex]!
    samplesPerFrame = 1152
    frameLength = Math.floor((144 * bitrateKbps * 1000) / sampleRate) + padding
  } else {
    bitrateKbps = MPEG2_L3_BITRATE_KBPS[bitrateIndex]!
    sampleRate =
      versionBits === 2
        ? MPEG2_SAMPLE_RATE[sampleRateIndex]!
        : MPEG25_SAMPLE_RATE[sampleRateIndex]!
    samplesPerFrame = 576
    frameLength = Math.floor((72 * bitrateKbps * 1000) / sampleRate) + padding
  }

  if (frameLength < 4 || bitrateKbps === 0) return null

  return {
    frameLength,
    durationSec: samplesPerFrame / sampleRate,
    sampleRate,
  }
}

function hasValidNextSync(data: Uint8Array, offset: number, frameLength: number): boolean {
  const next = offset + frameLength
  if (next + 4 > data.length) return true // last frame in buffer
  return readFrameHeader(data, next) !== null
}

/** Returns whole frames plus trailing partial bytes for the next call. */
export function splitMpegFrames(input: Uint8Array<ArrayBuffer>): {
  frames: MpegFrame[]
  remainder: Uint8Array<ArrayBuffer>
} {
  const frames: MpegFrame[] = []
  let offset = skipId3v2(input, 0)

  while (offset + 4 <= input.length) {
    const header = readFrameHeader(input, offset)
    if (!header) {
      offset += 1
      continue
    }
    if (offset + header.frameLength > input.length) break
    if (!hasValidNextSync(input, offset, header.frameLength)) {
      offset += 1
      continue
    }

    frames.push({
      bytes: input.subarray(offset, offset + header.frameLength) as Uint8Array<ArrayBuffer>,
      durationSec: header.durationSec,
      sampleRate: header.sampleRate,
    })
    offset += header.frameLength
  }

  return {
    frames,
    remainder: input.subarray(offset) as Uint8Array<ArrayBuffer>,
  }
}

/** @internal test helper — builds a valid MPEG1 Layer III 128kbps 44100Hz frame. */
export function buildTestMpegFrame(payloadFill = 0): Uint8Array<ArrayBuffer> {
  const sampleRate = 44100
  const bitrateKbps = 128
  const frameLength = Math.floor((144 * bitrateKbps * 1000) / sampleRate)
  const frame = new Uint8Array(frameLength) as Uint8Array<ArrayBuffer>
  // sync + MPEG1 Layer III
  frame[0] = 0xff
  frame[1] = 0xfb
  // 128kbps (1001), 44100 (00), no padding
  frame[2] = 0x90
  frame[3] = 0x00
  if (payloadFill !== 0) frame.fill(payloadFill, 4)
  return frame
}
