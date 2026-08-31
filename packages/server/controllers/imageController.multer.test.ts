import { describe, it, expect, vi } from "vitest"
import { Request, Response } from "express"
import multer from "multer"
import { CHAT_IMAGE_UPLOAD_MAX_BYTES } from "@repo/types"
import { handleImageUploadMulterError } from "./imageController"

describe("handleImageUploadMulterError", () => {
  it("returns 413 for LIMIT_FILE_SIZE", () => {
    const err = new multer.MulterError("LIMIT_FILE_SIZE")
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    const next = vi.fn()

    handleImageUploadMulterError(err, {} as Request, { status } as unknown as Response, next)

    expect(status).toHaveBeenCalledWith(413)
    expect(json).toHaveBeenCalledWith({
      error: `Each image must be under ${CHAT_IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024)}MB`,
    })
    expect(next).not.toHaveBeenCalled()
  })

  it("returns 415 for disallowed file type", () => {
    const json = vi.fn()
    const status = vi.fn().mockReturnValue({ json })
    const next = vi.fn()

    handleImageUploadMulterError(
      new Error("Only image files are allowed"),
      {} as Request,
      { status } as unknown as Response,
      next,
    )

    expect(status).toHaveBeenCalledWith(415)
    expect(next).not.toHaveBeenCalled()
  })
})
