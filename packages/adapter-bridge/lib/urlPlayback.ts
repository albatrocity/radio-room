import type { BridgeRpcClient } from "./rpcClient"

/**
 * Observed by `getPlayback` on the ducked URL player. Mirrors
 * `apps/bridge-daemon/src/drivers/Driver.ts#DriverState` — kept in a loose
 * shape here so old packs that reply with partial objects still parse.
 */
export type UrlPlaybackState = {
  state: "playing" | "paused" | "stopped"
  progressMs: number | null
  durationMs: number | null
  volumePercent?: number | null
  trackId?: string | null
  observed?: boolean
}

export type PlayUrlOnBridgeResult =
  | { ok: true; queued: true; mode: "replace" | "enqueue"; duck: boolean }
  | { ok: false; message: string; presenceMissing?: boolean }

/**
 * Invoke the daemon's generic URL sidechain (ADR 0212). Returns a tagged
 * result so callers (admin voicemail handler, future plugin callers) can
 * decide whether to fall back to a browser `<audio>` element.
 *
 * - `presenceMissing: true` → no bridge daemon is linked for this room.
 * - `ok: false` with a message → daemon replied with an error (unset device,
 *   non-https URL, old pack without `playUrl`, etc.).
 */
export async function playUrlOnBridge(params: {
  rpc: BridgeRpcClient
  url: string
  mode?: "replace" | "enqueue"
  duck: boolean
}): Promise<PlayUrlOnBridgeResult> {
  if (!(await params.rpc.isPresent())) {
    return { ok: false, message: "Bridge daemon not connected", presenceMissing: true }
  }
  try {
    const result = (await params.rpc.call("playUrl", {
      url: params.url,
      mode: params.mode ?? "replace",
      duck: params.duck,
    })) as unknown
    if (result && typeof result === "object" && (result as { queued?: boolean }).queued === true) {
      const r = result as {
        queued: true
        mode?: "replace" | "enqueue"
        duck?: boolean
      }
      return {
        ok: true,
        queued: true,
        mode: r.mode ?? params.mode ?? "replace",
        duck: r.duck ?? params.duck,
      }
    }
    return { ok: false, message: "Could not start URL playback on the bridge." }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, message: message || "URL playback RPC failed" }
  }
}

/**
 * Pause the ducked URL player (`source: "url"`). Returns `false` when no
 * daemon is linked so the caller can skip the ack. Callers still expected to
 * surface their own failure event when the RPC itself rejects.
 */
export async function pauseUrlOnBridge(params: {
  rpc: BridgeRpcClient
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!(await params.rpc.isPresent())) {
    return { ok: false, message: "Bridge daemon not connected" }
  }
  try {
    await params.rpc.call("pause", { source: "url" })
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function seekUrlOnBridge(params: {
  rpc: BridgeRpcClient
  positionMs: number
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!(await params.rpc.isPresent())) {
    return { ok: false, message: "Bridge daemon not connected" }
  }
  try {
    await params.rpc.call("seekTo", { source: "url", positionMs: params.positionMs })
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Read the ducked URL player's transport. Old packs return `observed: false`
 * (no `url` branch in dispatch) — the deck treats that as "no URL player"
 * and falls back to `<audio>`.
 */
export async function getUrlPlaybackOnBridge(params: {
  rpc: BridgeRpcClient
}): Promise<{ ok: true; state: UrlPlaybackState } | { ok: false; message: string }> {
  if (!(await params.rpc.isPresent())) {
    return { ok: false, message: "Bridge daemon not connected" }
  }
  try {
    const result = (await params.rpc.call("getPlayback", { source: "url" })) as unknown
    if (!result || typeof result !== "object") {
      return { ok: false, message: "Empty getPlayback response" }
    }
    return { ok: true, state: result as UrlPlaybackState }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
