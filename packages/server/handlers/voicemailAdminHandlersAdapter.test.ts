import { beforeEach, describe, expect, it, vi } from "vitest"

import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"
import { roomFactory } from "@repo/factories"

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const dataMocks = vi.hoisted(() => ({
  findRoom: vi.fn(),
  isRoomAdmin: vi.fn(),
}))

const serviceMocks = vi.hoisted(() => ({
  listVoicemails: vi.fn(),
  getVoicemailPresignedGet: vi.fn(),
  hideVoicemail: vi.fn(),
}))

vi.mock("../operations/data", () => ({
  findRoom: dataMocks.findRoom,
  isRoomAdmin: dataMocks.isRoomAdmin,
}))

vi.mock("../services/VoicemailService", async () => {
  // Preserve error classes so `instanceof` checks in the adapter still work.
  const actual = await vi.importActual<
    typeof import("../services/VoicemailService")
  >("../services/VoicemailService")
  return {
    ...actual,
    listVoicemails: serviceMocks.listVoicemails,
    getVoicemailPresignedGet: serviceMocks.getVoicemailPresignedGet,
    hideVoicemail: serviceMocks.hideVoicemail,
  }
})

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { VoicemailAdminHandlers } from "./voicemailAdminHandlersAdapter"
import {
  VoicemailBadRequestError,
  VoicemailNotFoundError,
} from "../services/VoicemailService"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VOICEMAIL_ROOM = roomFactory.build({
  id: "room123",
  creator: "admin123",
  activeSegmentId: "seg-1",
  activeShowSegmentId: "placement-1",
  activeSegmentRole: "voicemail",
})

const STANDARD_ROOM = roomFactory.build({
  id: "room123",
  creator: "admin123",
  activeSegmentId: "seg-std",
  activeShowSegmentId: "placement-std",
  activeSegmentRole: "standard",
})

describe("VoicemailAdminHandlers", () => {
  let socket: any
  let io: any
  let emit: any
  let handlers: VoicemailAdminHandlers
  let rpcCall: ReturnType<typeof vi.fn>
  let rpcIsPresent: ReturnType<typeof vi.fn>
  let getRpc: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetAllMocks()
    const result = makeSocketWithBroadcastMocks({
      roomId: "room123",
      userId: "admin123",
      username: "Admin",
    })
    socket = result.socket
    io = result.io
    emit = result.emit

    // RPC stub. Tests override `rpcCall` behavior per-case. Default: presence
    // is false so the default handler construction mimics a bridge-less room.
    rpcCall = vi.fn()
    rpcIsPresent = vi.fn().mockResolvedValue(false)
    getRpc = vi.fn().mockReturnValue({
      call: rpcCall,
      isPresent: rpcIsPresent,
    })
    handlers = new VoicemailAdminHandlers(getRpc as never)

    // Default: admin on a voicemail-segment room, and services resolve emptily.
    dataMocks.findRoom.mockResolvedValue(VOICEMAIL_ROOM)
    dataMocks.isRoomAdmin.mockResolvedValue(true)
    serviceMocks.listVoicemails.mockResolvedValue({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-11-01T00:00:00.000Z",
      truncated: false,
      items: [],
    })
    serviceMocks.hideVoicemail.mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // listVoicemails
  // -------------------------------------------------------------------------

  describe("listVoicemails", () => {
    it("emits LIST_VOICEMAILS_RESULT for an admin on a voicemail segment", async () => {
      serviceMocks.listVoicemails.mockResolvedValueOnce({
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-11-01T00:00:00.000Z",
        truncated: false,
        items: [
          {
            id: "vm-1",
            createdAt: "2026-10-15T12:00:00.000Z",
            durationMs: 5000,
            label: "Hi",
            url: "https://s3.example/presigned/vm-1",
          },
        ],
      })

      await handlers.listVoicemails(
        { socket, io },
        { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" },
      )

      expect(serviceMocks.listVoicemails).toHaveBeenCalledWith({
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-11-01T00:00:00.000Z",
      })
      expect(emit).toHaveBeenCalledWith(
        "event",
        expect.objectContaining({
          type: "LIST_VOICEMAILS_RESULT",
          data: expect.objectContaining({
            items: [
              expect.objectContaining({
                id: "vm-1",
                url: "https://s3.example/presigned/vm-1",
              }),
            ],
          }),
        }),
      )
    })

    it("rejects a non-admin with FORBIDDEN and does not call the service", async () => {
      dataMocks.isRoomAdmin.mockResolvedValueOnce(false)

      await handlers.listVoicemails(
        { socket, io },
        { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" },
      )

      expect(serviceMocks.listVoicemails).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "LIST_VOICEMAILS_FAILURE",
        data: expect.objectContaining({ code: "FORBIDDEN" }),
      })
    })

    it("rejects when the room has no voicemail segment active", async () => {
      dataMocks.findRoom.mockResolvedValueOnce(STANDARD_ROOM)

      await handlers.listVoicemails(
        { socket, io },
        { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" },
      )

      expect(serviceMocks.listVoicemails).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "LIST_VOICEMAILS_FAILURE",
        data: expect.objectContaining({ code: "WRONG_SEGMENT_ROLE" }),
      })
    })

    it("rejects a missing payload with BAD_REQUEST", async () => {
      await handlers.listVoicemails({ socket, io }, undefined)

      expect(serviceMocks.listVoicemails).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "LIST_VOICEMAILS_FAILURE",
        data: expect.objectContaining({ code: "BAD_REQUEST" }),
      })
    })

    it("surfaces VoicemailBadRequestError from the service as BAD_REQUEST", async () => {
      serviceMocks.listVoicemails.mockRejectedValueOnce(
        new VoicemailBadRequestError("from must be before to"),
      )

      await handlers.listVoicemails(
        { socket, io },
        { from: "2026-11-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
      )

      expect(emit).toHaveBeenCalledWith("event", {
        type: "LIST_VOICEMAILS_FAILURE",
        data: { code: "BAD_REQUEST", message: "from must be before to" },
      })
    })
  })

  // -------------------------------------------------------------------------
  // playVoicemail
  // -------------------------------------------------------------------------

  describe("playVoicemail", () => {
    const PRESIGN_FIXTURE = {
      row: {
        id: "vm-1",
        createdAt: "2026-10-15T12:00:00.000Z",
        s3Key: "voicemails/v1/vm-1.webm",
        contentType: "audio/webm",
        byteSize: 1024,
        durationMs: 7500,
        label: "Hi",
        status: "ready",
      },
      url: "https://s3.example/presigned/vm-1",
    }

    it("returns the URL and skips the bridge when no daemon is linked", async () => {
      serviceMocks.getVoicemailPresignedGet.mockResolvedValueOnce(PRESIGN_FIXTURE)
      getRpc.mockReturnValueOnce(undefined)

      await handlers.playVoicemail({ socket, io }, { id: "vm-1" })

      expect(serviceMocks.getVoicemailPresignedGet).toHaveBeenCalledWith("vm-1")
      expect(rpcCall).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "PLAY_VOICEMAIL_RESULT",
        data: {
          id: "vm-1",
          url: "https://s3.example/presigned/vm-1",
          durationMs: 7500,
          label: "Hi",
          bridgeAttempted: false,
          bridgeOk: false,
        },
      })
    })

    it("calls playUrl with mode=replace, duck=true when the bridge is linked", async () => {
      serviceMocks.getVoicemailPresignedGet.mockResolvedValueOnce(PRESIGN_FIXTURE)
      rpcIsPresent.mockResolvedValue(true)
      rpcCall.mockResolvedValue({ queued: true, mode: "replace", duck: true })

      await handlers.playVoicemail({ socket, io }, { id: "vm-1" })

      expect(rpcCall).toHaveBeenCalledWith("playUrl", {
        url: "https://s3.example/presigned/vm-1",
        mode: "replace",
        duck: true,
      })
      expect(emit).toHaveBeenCalledWith("event", {
        type: "PLAY_VOICEMAIL_RESULT",
        data: expect.objectContaining({
          id: "vm-1",
          url: "https://s3.example/presigned/vm-1",
          bridgeAttempted: true,
          bridgeOk: true,
        }),
      })
    })

    it("still returns the URL when the RPC rejects (deck falls back to <audio>)", async () => {
      serviceMocks.getVoicemailPresignedGet.mockResolvedValueOnce(PRESIGN_FIXTURE)
      rpcIsPresent.mockResolvedValue(true)
      rpcCall.mockRejectedValue(new Error("Unknown method playUrl"))

      await handlers.playVoicemail({ socket, io }, { id: "vm-1" })

      expect(emit).toHaveBeenCalledWith("event", {
        type: "PLAY_VOICEMAIL_RESULT",
        data: expect.objectContaining({
          id: "vm-1",
          url: "https://s3.example/presigned/vm-1",
          bridgeAttempted: true,
          bridgeOk: false,
        }),
      })
    })

    it("rejects a non-admin before presigning", async () => {
      dataMocks.isRoomAdmin.mockResolvedValueOnce(false)

      await handlers.playVoicemail({ socket, io }, { id: "vm-1" })

      expect(serviceMocks.getVoicemailPresignedGet).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "PLAY_VOICEMAIL_FAILURE",
        data: expect.objectContaining({ code: "FORBIDDEN" }),
      })
    })

    it("rejects when the active segment is not a voicemail", async () => {
      dataMocks.findRoom.mockResolvedValueOnce(STANDARD_ROOM)

      await handlers.playVoicemail({ socket, io }, { id: "vm-1" })

      expect(serviceMocks.getVoicemailPresignedGet).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "PLAY_VOICEMAIL_FAILURE",
        data: expect.objectContaining({ code: "WRONG_SEGMENT_ROLE" }),
      })
    })

    it("rejects a missing id with BAD_REQUEST", async () => {
      await handlers.playVoicemail({ socket, io }, { id: "" })

      expect(serviceMocks.getVoicemailPresignedGet).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "PLAY_VOICEMAIL_FAILURE",
        data: expect.objectContaining({ code: "BAD_REQUEST" }),
      })
    })

    it("maps a NotFound from the service to NOT_FOUND", async () => {
      serviceMocks.getVoicemailPresignedGet.mockRejectedValueOnce(
        new VoicemailNotFoundError("Voicemail not found"),
      )

      await handlers.playVoicemail({ socket, io }, { id: "vm-missing" })

      expect(emit).toHaveBeenCalledWith("event", {
        type: "PLAY_VOICEMAIL_FAILURE",
        data: { code: "NOT_FOUND", message: "Voicemail not found" },
      })
    })
  })

  // -------------------------------------------------------------------------
  // hideVoicemail
  // -------------------------------------------------------------------------

  describe("hideVoicemail", () => {
    it("hides a row and emits HIDE_VOICEMAIL_SUCCESS with the id", async () => {
      await handlers.hideVoicemail({ socket, io }, { id: "vm-1" })

      expect(serviceMocks.hideVoicemail).toHaveBeenCalledWith("vm-1")
      expect(emit).toHaveBeenCalledWith("event", {
        type: "HIDE_VOICEMAIL_SUCCESS",
        data: { id: "vm-1" },
      })
    })

    it("rejects a non-admin before mutating", async () => {
      dataMocks.isRoomAdmin.mockResolvedValueOnce(false)

      await handlers.hideVoicemail({ socket, io }, { id: "vm-1" })

      expect(serviceMocks.hideVoicemail).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "HIDE_VOICEMAIL_FAILURE",
        data: expect.objectContaining({ code: "FORBIDDEN" }),
      })
    })

    it("rejects when the active segment is not a voicemail", async () => {
      dataMocks.findRoom.mockResolvedValueOnce(STANDARD_ROOM)

      await handlers.hideVoicemail({ socket, io }, { id: "vm-1" })

      expect(serviceMocks.hideVoicemail).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "HIDE_VOICEMAIL_FAILURE",
        data: expect.objectContaining({ code: "WRONG_SEGMENT_ROLE" }),
      })
    })

    it("maps a service NOT_FOUND to HIDE_VOICEMAIL_FAILURE", async () => {
      serviceMocks.hideVoicemail.mockRejectedValueOnce(
        new VoicemailNotFoundError("Voicemail not found"),
      )

      await handlers.hideVoicemail({ socket, io }, { id: "vm-missing" })

      expect(emit).toHaveBeenCalledWith("event", {
        type: "HIDE_VOICEMAIL_FAILURE",
        data: { code: "NOT_FOUND", message: "Voicemail not found" },
      })
    })
  })

  // -------------------------------------------------------------------------
  // Phase 6 bridge transport (pause / seek / getPlayback → source: "url")
  // -------------------------------------------------------------------------

  describe("pauseVoicemail", () => {
    it("pauses the ducked URL player on the bridge", async () => {
      rpcIsPresent.mockResolvedValue(true)
      rpcCall.mockResolvedValue(null)

      await handlers.pauseVoicemail({ socket, io })

      expect(rpcCall).toHaveBeenCalledWith("pause", { source: "url" })
      expect(emit).toHaveBeenCalledWith("event", {
        type: "PAUSE_VOICEMAIL_SUCCESS",
        data: {},
      })
    })

    it("emits BRIDGE_UNAVAILABLE when no daemon is linked", async () => {
      getRpc.mockReturnValueOnce(undefined)

      await handlers.pauseVoicemail({ socket, io })

      expect(rpcCall).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "PAUSE_VOICEMAIL_FAILURE",
        data: expect.objectContaining({ code: "BRIDGE_UNAVAILABLE" }),
      })
    })

    it("refuses non-admins before touching the bridge", async () => {
      dataMocks.isRoomAdmin.mockResolvedValueOnce(false)

      await handlers.pauseVoicemail({ socket, io })

      expect(rpcCall).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "PAUSE_VOICEMAIL_FAILURE",
        data: expect.objectContaining({ code: "FORBIDDEN" }),
      })
    })
  })

  describe("seekVoicemail", () => {
    it("seeks the ducked URL player on the bridge", async () => {
      rpcIsPresent.mockResolvedValue(true)
      rpcCall.mockResolvedValue(null)

      await handlers.seekVoicemail({ socket, io }, { positionMs: 1500 })

      expect(rpcCall).toHaveBeenCalledWith("seekTo", { source: "url", positionMs: 1500 })
      expect(emit).toHaveBeenCalledWith("event", {
        type: "SEEK_VOICEMAIL_SUCCESS",
        data: { positionMs: 1500 },
      })
    })

    it("rejects a non-finite positionMs with BAD_REQUEST", async () => {
      rpcIsPresent.mockResolvedValue(true)

      await handlers.seekVoicemail({ socket, io }, { positionMs: Number.NaN })

      expect(rpcCall).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "SEEK_VOICEMAIL_FAILURE",
        data: expect.objectContaining({ code: "BAD_REQUEST" }),
      })
    })

    it("refuses non-admins before touching the bridge", async () => {
      dataMocks.isRoomAdmin.mockResolvedValueOnce(false)

      await handlers.seekVoicemail({ socket, io }, { positionMs: 1000 })

      expect(rpcCall).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "SEEK_VOICEMAIL_FAILURE",
        data: expect.objectContaining({ code: "FORBIDDEN" }),
      })
    })
  })

  describe("getVoicemailPlayback", () => {
    it("returns the ducked URL player's state", async () => {
      rpcIsPresent.mockResolvedValue(true)
      rpcCall.mockResolvedValue({
        state: "playing",
        progressMs: 1234,
        durationMs: 7500,
        observed: true,
      })

      await handlers.getVoicemailPlayback({ socket, io })

      expect(rpcCall).toHaveBeenCalledWith("getPlayback", { source: "url" })
      expect(emit).toHaveBeenCalledWith("event", {
        type: "GET_VOICEMAIL_PLAYBACK_RESULT",
        data: {
          state: "playing",
          progressMs: 1234,
          durationMs: 7500,
          observed: true,
        },
      })
    })

    it("forwards observed=false from an older pack so the deck falls back", async () => {
      rpcIsPresent.mockResolvedValue(true)
      rpcCall.mockResolvedValue({
        state: "stopped",
        progressMs: null,
        durationMs: null,
        observed: false,
      })

      await handlers.getVoicemailPlayback({ socket, io })

      expect(emit).toHaveBeenCalledWith("event", {
        type: "GET_VOICEMAIL_PLAYBACK_RESULT",
        data: expect.objectContaining({ observed: false }),
      })
    })

    it("refuses non-admins before touching the bridge", async () => {
      dataMocks.isRoomAdmin.mockResolvedValueOnce(false)

      await handlers.getVoicemailPlayback({ socket, io })

      expect(rpcCall).not.toHaveBeenCalled()
      expect(emit).toHaveBeenCalledWith("event", {
        type: "GET_VOICEMAIL_PLAYBACK_FAILURE",
        data: expect.objectContaining({ code: "FORBIDDEN" }),
      })
    })
  })
})
