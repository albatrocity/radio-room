/**
 * Magic-byte checks for Game Studio narrative sound uploads (ADR 0240).
 * Bytes are stored as-is under `assets/maps/sounds/`.
 */

export const MAX_SOUND_BYTES = 2 * 1024 * 1024

export type SoundFormat = { ext: "mp3" | "wav" | "ogg"; contentType: string }

export type SoundCheckResult =
  | { ok: true; body: Buffer; format: SoundFormat }
  | { ok: false; status: 400 | 413; message: string }

/**
 * MP3 (ID3 tag or MPEG frame sync), WAV (RIFF/WAVE), or Ogg (OggS).
 */
export function checkSound(input: Buffer): SoundCheckResult {
  if (input.length > MAX_SOUND_BYTES) {
    return { ok: false, status: 413, message: "Sound effects are limited to 2 MB." }
  }
  if (input.length < 4) {
    return {
      ok: false,
      status: 400,
      message: "That file isn't a sound Game Studio can publish (MP3, WAV, or Ogg).",
    }
  }
  if (input.toString("ascii", 0, 4) === "OggS") {
    return { ok: true, body: input, format: { ext: "ogg", contentType: "audio/ogg" } }
  }
  if (
    input.length >= 12 &&
    input.toString("ascii", 0, 4) === "RIFF" &&
    input.toString("ascii", 8, 12) === "WAVE"
  ) {
    return { ok: true, body: input, format: { ext: "wav", contentType: "audio/wav" } }
  }
  const id3 = input.toString("ascii", 0, 3) === "ID3"
  const frameSync = input.length >= 2 && input[0] === 0xff && (input[1]! & 0xe0) === 0xe0
  if (id3 || frameSync) {
    return { ok: true, body: input, format: { ext: "mp3", contentType: "audio/mpeg" } }
  }
  return {
    ok: false,
    status: 400,
    message: "That file isn't a sound Game Studio can publish (MP3, WAV, or Ogg).",
  }
}
