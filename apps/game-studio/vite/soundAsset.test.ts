import { describe, expect, it } from "vitest"
import { checkSound, MAX_SOUND_BYTES } from "./soundAsset"

describe("checkSound", () => {
  it("accepts MP3 with an ID3 tag", () => {
    const body = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(61, 0)])
    const result = checkSound(body)
    expect(result).toEqual({
      ok: true,
      body,
      format: { ext: "mp3", contentType: "audio/mpeg" },
    })
  })

  it("accepts MP3 with a frame sync", () => {
    const body = Buffer.from([0xff, 0xe0, 0x00, 0x00, 0x00, 0x00])
    expect(checkSound(body)).toMatchObject({
      ok: true,
      format: { ext: "mp3", contentType: "audio/mpeg" },
    })
  })

  it("accepts WAV (RIFF/WAVE)", () => {
    const body = Buffer.alloc(16, 0)
    body.write("RIFF", 0)
    body.write("WAVE", 8)
    expect(checkSound(body)).toMatchObject({
      ok: true,
      format: { ext: "wav", contentType: "audio/wav" },
    })
  })

  it("accepts Ogg", () => {
    const body = Buffer.from("OggS....")
    expect(checkSound(body)).toMatchObject({
      ok: true,
      format: { ext: "ogg", contentType: "audio/ogg" },
    })
  })

  it("rejects a non-audio body", () => {
    expect(checkSound(Buffer.from("not audio"))).toEqual({
      ok: false,
      status: 400,
      message: "That file isn't a sound Game Studio can publish (MP3, WAV, or Ogg).",
    })
  })

  it("rejects a file over 2 MB", () => {
    const body = Buffer.alloc(MAX_SOUND_BYTES + 1, 0)
    body.write("ID3", 0)
    expect(checkSound(body)).toEqual({
      ok: false,
      status: 413,
      message: "Sound effects are limited to 2 MB.",
    })
  })
})
