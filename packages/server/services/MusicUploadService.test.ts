import { describe, expect, it, beforeEach, afterEach } from "vitest"
import {
  assertAllowedUpload,
  buildMusicUploadKey,
  createMusicUploadPresign,
  MUSIC_UPLOAD_MAX_BYTES,
  sanitizeFilename,
  sanitizeUsernameSegment,
} from "./MusicUploadService"

describe("MusicUploadService", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.ASSET_S3_BUCKET = "listening-room-assets"
    process.env.AWS_REGION = "us-east-1"
    process.env.AWS_ACCESS_KEY_ID = "AKIATESTKEYIDEXAMPLE"
    process.env.AWS_SECRET_ACCESS_KEY = "testsecretkeyexample"
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("sanitizeFilename", () => {
    it("strips path segments and unsafe characters", () => {
      expect(sanitizeFilename("../../my track (1).mp3")).toBe("my-track-1-.mp3")
    })
  })

  describe("sanitizeUsernameSegment", () => {
    it("falls back to userId when username missing", () => {
      expect(sanitizeUsernameSegment(undefined, "user-abc")).toBe("user-abc")
    })

    it("sanitizes display names", () => {
      expect(sanitizeUsernameSegment("DJ Ross!", "user-abc")).toBe("DJ-Ross-")
    })
  })

  describe("assertAllowedUpload", () => {
    it("accepts mp3 by extension and mime", () => {
      expect(() =>
        assertAllowedUpload("song.mp3", "audio/mpeg", 1024),
      ).not.toThrow()
    })

    it("accepts zip archives", () => {
      expect(() =>
        assertAllowedUpload("pack.zip", "application/zip", 1024),
      ).not.toThrow()
    })

    it("rejects unknown types", () => {
      expect(() =>
        assertAllowedUpload("notes.txt", "text/plain", 1024),
      ).toThrow(/Unsupported file type/)
    })

    it("rejects oversize files", () => {
      expect(() =>
        assertAllowedUpload("big.mp3", "audio/mpeg", MUSIC_UPLOAD_MAX_BYTES + 1),
      ).toThrow(/maximum size/)
    })
  })

  describe("buildMusicUploadKey", () => {
    it("namespaces by username, date, and userId", () => {
      const key = buildMusicUploadKey("alice", "user-1", "track.flac")
      expect(key).toMatch(/^uploads\/alice\/\d{4}-\d{2}-\d{2}\/user-1\/[0-9a-f-]+-track\.flac$/)
    })
  })

  describe("createMusicUploadPresign", () => {
    it("does not hoist SDK checksum params onto the presigned PUT URL", async () => {
      const redis = {
        pubClient: {
          setEx: async () => undefined,
        },
      }
      const result = await createMusicUploadPresign(redis, {
        roomId: "room-1",
        userId: "user-1",
        username: "alice",
        filename: "track.mp3",
        contentType: "audio/mpeg",
        contentLength: 1024,
      })
      const url = new URL(result.uploadUrl)

      expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false)
      expect(url.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false)
    })
  })
})
