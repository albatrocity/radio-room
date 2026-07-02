import { Router, type Request, type Response } from "express"
import https from "https"
import type { AppContext } from "@repo/types"
import MessageValidator from "sns-validator"
import * as newsletter from "../services/NewsletterService"
import {
  NewsletterBadRequestError,
  NewsletterNotFoundError,
} from "../services/NewsletterService"

function getAppContext(req: Request): AppContext | undefined {
  return (req as Request & { context?: AppContext }).context
}

function handleNewsletterError(res: Response, error: unknown) {
  if (error instanceof NewsletterNotFoundError) {
    res.status(404).json({ error: error.message })
    return
  }
  if (error instanceof NewsletterBadRequestError) {
    res.status(400).json({ error: error.message })
    return
  }
  console.error("[newsletter]", error)
  res.status(500).json({ error: "Newsletter request failed" })
}

export function createNewsletterRouter(): Router {
  const router = Router()

  router.get("/issues", async (_req, res) => {
    try {
      res.json({ issues: await newsletter.findIssues() })
    } catch (error) {
      handleNewsletterError(res, error)
    }
  })

  router.get("/issues/:id", async (req, res) => {
    try {
      const issue = await newsletter.findIssueById(req.params.id)
      if (!issue) {
        res.status(404).json({ error: "Newsletter issue not found" })
        return
      }
      res.json({ issue })
    } catch (error) {
      handleNewsletterError(res, error)
    }
  })

  router.post("/issues", async (req, res) => {
    try {
      const createdBy = (req as Request & { platformUser?: { id: string } }).platformUser?.id
      if (!createdBy) {
        res.status(401).json({ error: "Unauthorized" })
        return
      }
      const issue = await newsletter.createIssue(req.body, createdBy)
      res.status(201).json({ issue })
    } catch (error) {
      handleNewsletterError(res, error)
    }
  })

  router.put("/issues/:id", async (req, res) => {
    try {
      res.json({ issue: await newsletter.updateIssue(req.params.id, req.body) })
    } catch (error) {
      handleNewsletterError(res, error)
    }
  })

  router.delete("/issues/:id", async (req, res) => {
    try {
      await newsletter.deleteIssue(req.params.id, getAppContext(req))
      res.status(204).end()
    } catch (error) {
      handleNewsletterError(res, error)
    }
  })

  router.post("/issues/:id/preview", async (req, res) => {
    try {
      res.json({ html: await newsletter.previewIssue(req.params.id) })
    } catch (error) {
      handleNewsletterError(res, error)
    }
  })

  router.post("/issues/:id/send", async (req, res) => {
    try {
      res.json({ issue: await newsletter.sendIssueNow(req.params.id, getAppContext(req)) })
    } catch (error) {
      handleNewsletterError(res, error)
    }
  })

  router.post("/issues/:id/schedule", async (req, res) => {
    try {
      res.json({
        issue: await newsletter.scheduleIssue(req.params.id, req.body, getAppContext(req)),
      })
    } catch (error) {
      handleNewsletterError(res, error)
    }
  })

  router.post("/issues/:id/cancel", async (req, res) => {
    try {
      res.json({ issue: await newsletter.cancelScheduledIssue(req.params.id, getAppContext(req)) })
    } catch (error) {
      handleNewsletterError(res, error)
    }
  })

  router.get("/subscribers", async (_req, res) => {
    try {
      res.json(await newsletter.listSubscribers())
    } catch (error) {
      handleNewsletterError(res, error)
    }
  })

  return router
}

// ---------------------------------------------------------------------------
// Public routes (mounted outside requireAdmin)
// ---------------------------------------------------------------------------

export async function subscribeNewsletterHandler(req: Request, res: Response) {
  try {
    const { email, source } = req.body ?? {}
    await newsletter.subscribe(email, source)
    res.json({ ok: true })
  } catch (error) {
    handleNewsletterError(res, error)
  }
}

export async function confirmNewsletterHandler(req: Request, res: Response) {
  try {
    const token = String(req.query.token ?? "")
    const email = String(req.query.email ?? "")
    if (!token || !email) {
      res.status(400).json({ error: "token and email are required" })
      return
    }
    await newsletter.confirmSubscription(token, email)
    const appUrl = (process.env.APP_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
    res.redirect(`${appUrl}/newsletter/confirmed`)
  } catch (error) {
    if (error instanceof NewsletterBadRequestError) {
      res.status(400).send(error.message)
      return
    }
    console.error("[newsletter] confirm:", error)
    res.status(500).send("Confirmation failed")
  }
}

/**
 * One-click unsubscribe. Supports both GET (link in email footer) and
 * POST (RFC 8058 List-Unsubscribe-Post for inbox provider one-click).
 */
export async function unsubscribeNewsletterHandler(req: Request, res: Response) {
  try {
    const token = String(req.query.token ?? req.body?.token ?? "")
    if (!token) {
      res.status(400).send("Missing unsubscribe token")
      return
    }
    await newsletter.unsubscribeByToken(token)
    if (req.method === "POST") {
      res.status(200).json({ ok: true })
      return
    }
    res
      .status(200)
      .send(
        "<html><body style=\"font-family:sans-serif;padding:2rem\"><h1>You're unsubscribed</h1><p>You will no longer receive Listening Room newsletter emails.</p></body></html>",
      )
  } catch (error) {
    if (error instanceof NewsletterBadRequestError || error instanceof NewsletterNotFoundError) {
      res.status(400).send(error.message)
      return
    }
    console.error("[newsletter] unsubscribe:", error)
    res.status(500).send("Unsubscribe failed")
  }
}

// ---------------------------------------------------------------------------
// SES bounce/complaint webhook (delivered via SNS)
// ---------------------------------------------------------------------------

const snsValidator = new MessageValidator()

function validateSnsMessage(body: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    snsValidator.validate(body as never, (err, message) => {
      if (err) reject(err)
      else resolve(message as unknown as Record<string, unknown>)
    })
  })
}

function confirmSnsSubscription(subscribeUrl: string): void {
  https
    .get(subscribeUrl, () => {
      console.log("[newsletter] Confirmed SNS subscription")
    })
    .on("error", (err) => console.error("[newsletter] SNS confirm error:", err))
}

export async function handleSesSnsWebhook(req: Request, res: Response) {
  try {
    const raw =
      typeof req.body === "string" || Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString("utf8"))
        : req.body

    const message = await validateSnsMessage(raw)
    const type = message.Type as string | undefined

    if (type === "SubscriptionConfirmation") {
      const subscribeUrl = message.SubscribeURL as string | undefined
      if (subscribeUrl) confirmSnsSubscription(subscribeUrl)
      return res.status(200).json({ ok: true })
    }

    if (type === "Notification") {
      const messageBody = message.Message as string | undefined
      if (messageBody) {
        try {
          await newsletter.handleSesNotification(JSON.parse(messageBody))
        } catch (parseError) {
          console.error("[newsletter] Failed to parse SES notification:", parseError)
        }
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error("[newsletter] SNS webhook error:", error)
    return res.status(400).json({ error: "invalid SNS message" })
  }
}
