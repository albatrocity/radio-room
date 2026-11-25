import type { AppContext, HandlerConnections, Room } from "@repo/types"
import {
  getBridgeRpcClient,
  getUrlPlaybackOnBridge,
  pauseUrlOnBridge,
  playUrlOnBridge,
  seekUrlOnBridge,
  type UrlPlaybackState,
} from "@repo/adapter-bridge"
import type { BridgeRpcClient } from "@repo/adapter-bridge"
import { findRoom, isRoomAdmin } from "../operations/data"
import {
  getVoicemailPresignedGet,
  hideVoicemail,
  listVoicemails,
  VoicemailBadRequestError,
  VoicemailForbiddenError,
  VoicemailNotFoundError,
} from "../services/VoicemailService"

// ---------------------------------------------------------------------------
// Socket event types owned by this adapter (phase 5, ADR 0212)
// ---------------------------------------------------------------------------

export type ListVoicemailsPayload = { from: string; to: string }
export type HideVoicemailPayload = { id: string }
export type PlayVoicemailPayload = { id: string }
export type SeekVoicemailPayload = { positionMs: number }

type FailureEvent =
  | "LIST_VOICEMAILS_FAILURE"
  | "PLAY_VOICEMAIL_FAILURE"
  | "HIDE_VOICEMAIL_FAILURE"
  | "PAUSE_VOICEMAIL_FAILURE"
  | "SEEK_VOICEMAIL_FAILURE"
  | "GET_VOICEMAIL_PLAYBACK_FAILURE"

type FailureCode =
  | "FORBIDDEN"
  | "WRONG_SEGMENT_ROLE"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "BRIDGE_UNAVAILABLE"
  | "INTERNAL"

interface FailurePayload {
  code: FailureCode
  message: string
}

// ---------------------------------------------------------------------------
// Admin guard
// ---------------------------------------------------------------------------

type GuardResult =
  | { ok: true; room: Room }
  | { ok: false; code: Exclude<FailureCode, "BRIDGE_UNAVAILABLE" | "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL">; message: string }

/**
 * Ensure the requesting socket is a room admin AND the room's active segment
 * role is `voicemail`. Returns the loaded room on success (ADR 0212 §3).
 */
async function ensureVoicemailAdmin(
  { socket }: HandlerConnections,
): Promise<GuardResult> {
  const { context } = socket
  const { roomId, userId } = socket.data

  const room = await findRoom({ context, roomId })
  if (!room) {
    return { ok: false, code: "FORBIDDEN", message: "Room not found." }
  }

  const admin = await isRoomAdmin({
    context,
    roomId,
    userId,
    roomCreator: room.creator ?? null,
  })
  if (!admin) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You are not a room admin.",
    }
  }

  if (room.activeSegmentRole !== "voicemail") {
    return {
      ok: false,
      code: "WRONG_SEGMENT_ROLE",
      message: "The active segment is not a voicemail segment.",
    }
  }

  return { ok: true, room }
}

function emitFailure(
  { socket }: HandlerConnections,
  type: FailureEvent,
  payload: FailurePayload,
): void {
  socket.emit("event", { type, data: payload })
}

function mapServiceError(error: unknown): FailurePayload {
  if (error instanceof VoicemailBadRequestError) {
    return { code: "BAD_REQUEST", message: error.message }
  }
  if (error instanceof VoicemailNotFoundError) {
    return { code: "NOT_FOUND", message: error.message }
  }
  if (error instanceof VoicemailForbiddenError) {
    return { code: "FORBIDDEN", message: error.message }
  }
  console.error("[voicemail-admin]", error)
  return {
    code: "INTERNAL",
    message: "Voicemail request failed.",
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bridge RPC accessor (overridable in tests)
// ---------------------------------------------------------------------------

export type BridgeRpcLookup = (roomId: string) => BridgeRpcClient | undefined

export class VoicemailAdminHandlers {
  constructor(
    private readonly getRpc: BridgeRpcLookup = getBridgeRpcClient,
  ) {}

  /**
   * List voicemails in [from, to). Admin only; only while the room's active
   * segment role is `voicemail`.
   *
   * Emits `LIST_VOICEMAILS_RESULT` on success (payload: ListVoicemailsResponse),
   * or `LIST_VOICEMAILS_FAILURE` with a code + message.
   */
  listVoicemails = async (
    connections: HandlerConnections,
    payload: ListVoicemailsPayload | undefined,
  ) => {
    const guard = await ensureVoicemailAdmin(connections)
    if (!guard.ok) {
      emitFailure(connections, "LIST_VOICEMAILS_FAILURE", {
        code: guard.code,
        message: guard.message,
      })
      return
    }

    if (!payload || typeof payload.from !== "string" || typeof payload.to !== "string") {
      emitFailure(connections, "LIST_VOICEMAILS_FAILURE", {
        code: "BAD_REQUEST",
        message: "from and to are required.",
      })
      return
    }

    try {
      const result = await listVoicemails({ from: payload.from, to: payload.to })
      connections.socket.emit("event", {
        type: "LIST_VOICEMAILS_RESULT",
        data: result,
      })
    } catch (error) {
      emitFailure(connections, "LIST_VOICEMAILS_FAILURE", mapServiceError(error))
    }
  }

  /**
   * Mint a fresh presigned GET and try to hand it to the DJ Mac's URL
   * sidechain (`playUrl`, `duck: true`, `mode: "replace"` — ADR 0212). The URL
   * is always included in the ack so the admin deck can fall back to the
   * browser `<audio>` element when the bridge is disconnected, when the pack
   * is too old to understand `playUrl`, or when `tts.audioDevice` is unset.
   *
   * We do NOT pause the room playback controller: the whole point of the
   * ducked sidechain is to keep the bed running underneath the voicemail.
   */
  playVoicemail = async (
    connections: HandlerConnections,
    payload: PlayVoicemailPayload | undefined,
  ) => {
    const guard = await ensureVoicemailAdmin(connections)
    if (!guard.ok) {
      emitFailure(connections, "PLAY_VOICEMAIL_FAILURE", {
        code: guard.code,
        message: guard.message,
      })
      return
    }

    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    if (!id) {
      emitFailure(connections, "PLAY_VOICEMAIL_FAILURE", {
        code: "BAD_REQUEST",
        message: "id is required.",
      })
      return
    }

    let row: Awaited<ReturnType<typeof getVoicemailPresignedGet>>["row"]
    let url: string
    try {
      const presigned = await getVoicemailPresignedGet(id)
      row = presigned.row
      url = presigned.url
    } catch (error) {
      emitFailure(connections, "PLAY_VOICEMAIL_FAILURE", mapServiceError(error))
      return
    }

    // Best-effort bridge attempt. Any failure path (no daemon linked, RPC
    // timeout, unset audio device, old pack) resolves as `bridgeOk: false`
    // with the URL still in the ack — the deck owns the fallback decision.
    const { bridgeAttempted, bridgeOk } = await this.tryPlayOnBridge({
      roomId: connections.socket.data.roomId,
      url,
    })

    connections.socket.emit("event", {
      type: "PLAY_VOICEMAIL_RESULT",
      data: {
        id: row.id,
        url,
        durationMs: row.durationMs,
        label: row.label,
        bridgeAttempted,
        bridgeOk,
      },
    })
  }

  private async tryPlayOnBridge(params: {
    roomId: string
    url: string
  }): Promise<{ bridgeAttempted: boolean; bridgeOk: boolean }> {
    const rpc = this.getRpc(params.roomId)
    if (!rpc) {
      return { bridgeAttempted: false, bridgeOk: false }
    }
    const result = await playUrlOnBridge({
      rpc,
      url: params.url,
      mode: "replace",
      duck: true,
    })
    if (result.ok) return { bridgeAttempted: true, bridgeOk: true }
    if (result.presenceMissing) {
      // No daemon connected for the room — don't mark as attempted so the
      // deck does not log a spurious bridge error.
      return { bridgeAttempted: false, bridgeOk: false }
    }
    console.warn("[voicemail-admin] playUrl failed:", result.message)
    return { bridgeAttempted: true, bridgeOk: false }
  }

  /**
   * Hide a voicemail from future admin lists. Admin only; voicemail segment only.
   *
   * Emits `HIDE_VOICEMAIL_SUCCESS` with `{ id }` or `HIDE_VOICEMAIL_FAILURE`.
   */
  hideVoicemail = async (
    connections: HandlerConnections,
    payload: HideVoicemailPayload | undefined,
  ) => {
    const guard = await ensureVoicemailAdmin(connections)
    if (!guard.ok) {
      emitFailure(connections, "HIDE_VOICEMAIL_FAILURE", {
        code: guard.code,
        message: guard.message,
      })
      return
    }

    const id = typeof payload?.id === "string" ? payload.id.trim() : ""
    if (!id) {
      emitFailure(connections, "HIDE_VOICEMAIL_FAILURE", {
        code: "BAD_REQUEST",
        message: "id is required.",
      })
      return
    }

    try {
      await hideVoicemail(id)
      connections.socket.emit("event", {
        type: "HIDE_VOICEMAIL_SUCCESS",
        data: { id },
      })
    } catch (error) {
      emitFailure(connections, "HIDE_VOICEMAIL_FAILURE", mapServiceError(error))
    }
  }

  /**
   * Pause the ducked URL player (ADR 0212, `source: "url"`). When the bridge
   * is unavailable, emit `BRIDGE_UNAVAILABLE` so the deck knows it owns
   * transport via the browser `<audio>` element.
   */
  pauseVoicemail = async (connections: HandlerConnections) => {
    const guard = await ensureVoicemailAdmin(connections)
    if (!guard.ok) {
      emitFailure(connections, "PAUSE_VOICEMAIL_FAILURE", {
        code: guard.code,
        message: guard.message,
      })
      return
    }
    const rpc = this.getRpc(connections.socket.data.roomId)
    if (!rpc) {
      emitFailure(connections, "PAUSE_VOICEMAIL_FAILURE", {
        code: "BRIDGE_UNAVAILABLE",
        message: "Bridge daemon not connected.",
      })
      return
    }
    const result = await pauseUrlOnBridge({ rpc })
    if (!result.ok) {
      emitFailure(connections, "PAUSE_VOICEMAIL_FAILURE", {
        code: "BRIDGE_UNAVAILABLE",
        message: result.message,
      })
      return
    }
    connections.socket.emit("event", {
      type: "PAUSE_VOICEMAIL_SUCCESS",
      data: {},
    })
  }

  /** Seek the ducked URL player (ADR 0212, `source: "url"`). */
  seekVoicemail = async (
    connections: HandlerConnections,
    payload: SeekVoicemailPayload | undefined,
  ) => {
    const guard = await ensureVoicemailAdmin(connections)
    if (!guard.ok) {
      emitFailure(connections, "SEEK_VOICEMAIL_FAILURE", {
        code: guard.code,
        message: guard.message,
      })
      return
    }
    const positionMs = Number(payload?.positionMs)
    if (!Number.isFinite(positionMs) || positionMs < 0) {
      emitFailure(connections, "SEEK_VOICEMAIL_FAILURE", {
        code: "BAD_REQUEST",
        message: "positionMs must be a non-negative number.",
      })
      return
    }
    const rpc = this.getRpc(connections.socket.data.roomId)
    if (!rpc) {
      emitFailure(connections, "SEEK_VOICEMAIL_FAILURE", {
        code: "BRIDGE_UNAVAILABLE",
        message: "Bridge daemon not connected.",
      })
      return
    }
    const result = await seekUrlOnBridge({ rpc, positionMs })
    if (!result.ok) {
      emitFailure(connections, "SEEK_VOICEMAIL_FAILURE", {
        code: "BRIDGE_UNAVAILABLE",
        message: result.message,
      })
      return
    }
    connections.socket.emit("event", {
      type: "SEEK_VOICEMAIL_SUCCESS",
      data: { positionMs },
    })
  }

  /**
   * Read the ducked URL player's transport (ADR 0212, `source: "url"`). When
   * the daemon reports `observed: false` the deck treats this as "no URL
   * player" and falls back to the browser `<audio>` scrubber.
   */
  getVoicemailPlayback = async (connections: HandlerConnections) => {
    const guard = await ensureVoicemailAdmin(connections)
    if (!guard.ok) {
      emitFailure(connections, "GET_VOICEMAIL_PLAYBACK_FAILURE", {
        code: guard.code,
        message: guard.message,
      })
      return
    }
    const rpc = this.getRpc(connections.socket.data.roomId)
    if (!rpc) {
      emitFailure(connections, "GET_VOICEMAIL_PLAYBACK_FAILURE", {
        code: "BRIDGE_UNAVAILABLE",
        message: "Bridge daemon not connected.",
      })
      return
    }
    const result = await getUrlPlaybackOnBridge({ rpc })
    if (!result.ok) {
      emitFailure(connections, "GET_VOICEMAIL_PLAYBACK_FAILURE", {
        code: "BRIDGE_UNAVAILABLE",
        message: result.message,
      })
      return
    }
    const state: UrlPlaybackState = result.state
    connections.socket.emit("event", {
      type: "GET_VOICEMAIL_PLAYBACK_RESULT",
      data: {
        state: state.state,
        progressMs: state.progressMs,
        durationMs: state.durationMs,
        // `observed === false` from an old pack signals the dispatch branch is
        // missing — the deck uses this to fall back to <audio>.
        observed: state.observed !== false,
      },
    })
  }
}

export function createVoicemailAdminHandlers(_context: AppContext): VoicemailAdminHandlers {
  // `context` is accepted for symmetry with other handler factories. Bridge
  // RPC is resolved per-call through the module-scope registry in
  // `@repo/adapter-bridge` so AdapterService controls the client lifecycle.
  return new VoicemailAdminHandlers()
}
