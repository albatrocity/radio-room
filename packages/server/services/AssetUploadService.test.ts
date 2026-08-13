import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createPresignedUpload } from "./AssetUploadService"

describe("createPresignedUpload", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.ASSET_S3_BUCKET = "listening-room-assets"
    process.env.ASSET_CDN_BASE_URL = "https://cdn.listeningroom.club"
    process.env.AWS_REGION = "us-east-1"
    process.env.AWS_ACCESS_KEY_ID = "AKIATESTKEYIDEXAMPLE"
    process.env.AWS_SECRET_ACCESS_KEY = "testsecretkeyexample"
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("returns a CloudFront public URL under newsletter/", async () => {
    const result = await createPresignedUpload({
      filename: "tooty-briney.jpg",
      contentType: "image/jpeg",
    })

    expect(result.key).toMatch(/^newsletter\/.+\/.+-tooty-briney\.jpg$/)
    expect(result.publicUrl).toBe(`https://cdn.listeningroom.club/${result.key}`)
  })

  it("does not hoist SDK checksum params onto the presigned PUT URL", async () => {
    const result = await createPresignedUpload({
      filename: "photo.png",
      contentType: "image/png",
    })
    const url = new URL(result.uploadUrl)

    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host")
    expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false)
    expect(url.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false)
  })

  it("rejects unsupported content types", async () => {
    await expect(
      createPresignedUpload({
        filename: "notes.txt",
        contentType: "text/plain",
      }),
    ).rejects.toThrow(/Unsupported content type/)
  })
})
