import type { AppContext } from "@repo/types"

/**
 * List macOS `say` voices from the linked Media Bridge daemon (ADR 0178).
 * Same-socket reply path — not a system event.
 */
export async function listMediaBridgeSayVoices(params: {
  context: AppContext
  roomId: string
}): Promise<{ voices: Array<{ id: string; name: string; locale: string }>; error?: string }> {
  const { context, roomId } = params
  try {
    const { getBridgeRpcClient, listSayVoices } = await import("@repo/adapter-bridge")
    const rpc = getBridgeRpcClient(roomId)
    if (!rpc) {
      return {
        voices: [],
        error: "The line is dead — the DJ Mac isn’t linked.",
      }
    }
    const result = await listSayVoices({ rpc })
    if (!result.voices.length) {
      return {
        voices: [],
        error: "No voices available from the DJ Mac.",
      }
    }
    return { voices: result.voices }
  } catch (e) {
    console.warn("[listMediaBridgeSayVoices]", e)
    return {
      voices: [],
      error: e instanceof Error ? e.message : "Failed to list voices",
    }
  }
}
