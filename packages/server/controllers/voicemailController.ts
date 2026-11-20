import type { Request, Response } from "express"
import type { AppContext } from "@repo/types"
import {
  completeVoicemail,
  createVoicemailPresign,
  VoicemailBadRequestError,
  VoicemailForbiddenError,
  VoicemailNotFoundError,
  VoicemailRateLimitedError,
} from "../services/VoicemailService"

function handleVoicemailError(res: Response, error: unknown) {
  if (error instanceof VoicemailRateLimitedError) {
    res.status(429).json({ error: error.message })
    return
  }
  if (error instanceof VoicemailNotFoundError) {
    res.status(404).json({ error: error.message })
    return
  }
  if (error instanceof VoicemailForbiddenError) {
    res.status(403).json({ error: error.message })
    return
  }
  if (error instanceof VoicemailBadRequestError) {
    res.status(400).json({ error: error.message })
    return
  }
  console.error("[voicemail]", error)
  res.status(500).json({ error: "Voicemail request failed" })
}

function getContext(req: Request): AppContext | undefined {
  return (req as Request & { context?: AppContext }).context
}

function getClientIp(req: Request): string {
  // Express with `trust proxy` sets `req.ip` from X-Forwarded-For. Fall back to
  // the socket remote address so a missing header does not blow up.
  return req.ip || req.socket?.remoteAddress || "unknown"
}

export async function presignVoicemailHandler(req: Request, res: Response) {
  const context = getContext(req)
  if (!context) {
    return res.status(500).json({ error: "Server context unavailable" })
  }

  const body = (req.body ?? {}) as {
    contentType?: string
    contentLength?: number
    durationMs?: number
    label?: string | null
  }

  try {
    const result = await createVoicemailPresign({
      redis: context.redis,
      ip: getClientIp(req),
      contentType: body.contentType ?? "",
      contentLength: Number(body.contentLength),
      durationMs: Number(body.durationMs),
      label: body.label ?? null,
    })
    res.json(result)
  } catch (error) {
    handleVoicemailError(res, error)
  }
}

export async function completeVoicemailHandler(req: Request, res: Response) {
  const context = getContext(req)
  if (!context) {
    return res.status(500).json({ error: "Server context unavailable" })
  }

  const body = (req.body ?? {}) as { uploadId?: string }

  try {
    const result = await completeVoicemail({
      redis: context.redis,
      ip: getClientIp(req),
      uploadId: body.uploadId ?? "",
    })
    res.json(result)
  } catch (error) {
    handleVoicemailError(res, error)
  }
}
