import type { BridgeRpcClient } from "./rpcClient"
import {
  BRIDGE_SAY_MAX_CHARS,
  bridgeSayCodePointLength,
  sanitizeBridgeSayText,
  type BridgeSayVoice,
} from "./protocol"

export type { BridgeSayVoice }

export type ListSayVoicesResult = {
  voices: BridgeSayVoice[]
}

export type SpeakOnBridgeResult =
  | { ok: true; queued: true }
  | { ok: false; message: string }

/**
 * List installed macOS `say` voices via the Media Bridge daemon (ADR 0177).
 */
export async function listSayVoices(params: {
  rpc: BridgeRpcClient
}): Promise<ListSayVoicesResult> {
  if (!(await params.rpc.isPresent())) return { voices: [] }
  try {
    const result = (await params.rpc.call("listSayVoices", {})) as unknown
    if (!result || typeof result !== "object") return { voices: [] }
    const voices = (result as { voices?: unknown }).voices
    if (!Array.isArray(voices)) return { voices: [] }
    return {
      voices: voices.filter(
        (v): v is BridgeSayVoice =>
          !!v &&
          typeof v === "object" &&
          typeof (v as BridgeSayVoice).id === "string" &&
          typeof (v as BridgeSayVoice).name === "string" &&
          typeof (v as BridgeSayVoice).locale === "string",
      ),
    }
  } catch {
    return { voices: [] }
  }
}

/**
 * Queue TTS on the DJ Mac through the Media Bridge daemon (ADR 0177).
 * Does not wait for mpv playback to finish.
 */
export async function speakOnBridge(params: {
  rpc: BridgeRpcClient
  text: string
  voice: string
}): Promise<SpeakOnBridgeResult> {
  const text = sanitizeBridgeSayText(params.text)
  if (!text) {
    return { ok: false, message: "Enter a message to send." }
  }
  if (bridgeSayCodePointLength(text) > BRIDGE_SAY_MAX_CHARS) {
    return {
      ok: false,
      message: `Message must be ${BRIDGE_SAY_MAX_CHARS} characters or fewer.`,
    }
  }
  const voice = typeof params.voice === "string" ? params.voice.trim() : ""
  if (!voice) {
    return { ok: false, message: "Choose a voice." }
  }
  if (!(await params.rpc.isPresent())) {
    return { ok: false, message: "The line is dead — the DJ Mac isn’t linked." }
  }
  try {
    const result = (await params.rpc.call("speak", { text, voice })) as unknown
    if (result && typeof result === "object" && (result as { queued?: boolean }).queued === true) {
      return { ok: true, queued: true }
    }
    return { ok: false, message: "Could not put the call through." }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, message: message || "Could not put the call through." }
  }
}
