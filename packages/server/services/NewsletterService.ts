import crypto from "crypto"
import { createId } from "@paralleldrive/cuid2"
import { db, subscriber, newsletterIssue, verification } from "@repo/db"
import { renderConfirmEmail, renderNewsletter } from "@repo/email"
import type {
  CreateNewsletterIssueRequest,
  NewsletterIssueDTO,
  NewsletterSubscribersSummary,
  ScheduleNewsletterIssueRequest,
  SubscriberDTO,
  UpdateNewsletterIssueRequest,
} from "@repo/types"
import { and, desc, eq } from "drizzle-orm"
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2"
import type { AppContext } from "@repo/types"

const NEWSLETTER_SCHEDULED_REDIS_KEY = "newsletter:scheduled"
const CONFIRM_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SEND_CONCURRENCY = 10

export class NewsletterBadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NewsletterBadRequestError"
  }
}

export class NewsletterNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NewsletterNotFoundError"
  }
}

// ---------------------------------------------------------------------------
// Config helpers (read at point of use, guarded)
// ---------------------------------------------------------------------------

function getSesFrom(): string {
  const from = process.env.NEWSLETTER_FROM
  if (!from) throw new NewsletterBadRequestError("NEWSLETTER_FROM is not configured")
  return from
}

function getAwsRegion(): string {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1"
}

function getUnsubscribeSecret(): string {
  const secret =
    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    process.env.SESSION_SECRET
  if (!secret) {
    throw new NewsletterBadRequestError("NEWSLETTER_UNSUBSCRIBE_SECRET is not configured")
  }
  return secret
}

function getApiUrl(): string {
  return (process.env.API_URL || process.env.VITE_API_URL || "http://127.0.0.1:3000").replace(
    /\/$/,
    "",
  )
}

function getAppUrl(): string {
  return (process.env.APP_URL || "http://127.0.0.1:8000").replace(/\/$/, "")
}

let sesClient: SESv2Client | null = null
function getSesClient(): SESv2Client {
  if (!sesClient) {
    sesClient = new SESv2Client({ region: getAwsRegion() })
  }
  return sesClient
}

// ---------------------------------------------------------------------------
// Unsubscribe tokens (stateless HMAC; no DB storage required)
// ---------------------------------------------------------------------------

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function fromBase64Url(input: string): string {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
}

function signSubscriberId(subscriberId: string): string {
  return crypto
    .createHmac("sha256", getUnsubscribeSecret())
    .update(subscriberId)
    .digest("hex")
}

export function createUnsubscribeToken(subscriberId: string): string {
  return `${base64Url(subscriberId)}.${signSubscriberId(subscriberId)}`
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [encodedId, signature] = token.split(".")
  if (!encodedId || !signature) return null
  let subscriberId: string
  try {
    subscriberId = fromBase64Url(encodedId)
  } catch {
    return null
  }
  const expected = signSubscriberId(subscriberId)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  return subscriberId
}

function buildUnsubscribeUrl(subscriberId: string): string {
  const token = createUnsubscribeToken(subscriberId)
  return `${getApiUrl()}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapSubscriberRow(row: typeof subscriber.$inferSelect): SubscriberDTO {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    wantsEmail: row.wantsEmail,
    entitlement: row.entitlement,
    source: row.source,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    unsubscribedAt: row.unsubscribedAt?.toISOString() ?? null,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function mapIssueRow(row: typeof newsletterIssue.$inferSelect): NewsletterIssueDTO {
  return {
    id: row.id,
    subject: row.subject,
    bodyMarkdown: row.bodyMarkdown,
    status: row.status,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function confirmIdentifier(email: string): string {
  return `newsletter:${email.toLowerCase()}`
}

async function requireIssue(id: string) {
  const row = await db.query.newsletterIssue.findFirst({ where: eq(newsletterIssue.id, id) })
  if (!row) throw new NewsletterNotFoundError("Newsletter issue not found")
  return row
}

// ---------------------------------------------------------------------------
// SES send
// ---------------------------------------------------------------------------

async function sendViaSes(input: {
  to: string
  subject: string
  html: string
  unsubscribeUrl: string
}): Promise<void> {
  const client = getSesClient()
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: getSesFrom(),
      Destination: { ToAddresses: [input.to] },
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: "UTF-8" },
          Body: { Html: { Data: input.html, Charset: "UTF-8" } },
          Headers: [
            { Name: "List-Unsubscribe", Value: `<${input.unsubscribeUrl}>` },
            { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
          ],
        },
      },
    }),
  )
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<{ sent: number; failed: number }> {
  let index = 0
  let sent = 0
  let failed = 0

  async function next(): Promise<void> {
    const current = index++
    if (current >= items.length) return
    try {
      await worker(items[current])
      sent++
    } catch (error) {
      failed++
      console.error("[newsletter] send failed:", error)
    }
    await next()
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => next())
  await Promise.all(runners)
  return { sent, failed }
}

// ---------------------------------------------------------------------------
// Issue CRUD
// ---------------------------------------------------------------------------

export async function findIssues(): Promise<NewsletterIssueDTO[]> {
  const rows = await db.query.newsletterIssue.findMany({
    orderBy: [desc(newsletterIssue.updatedAt)],
  })
  return rows.map(mapIssueRow)
}

export async function findIssueById(id: string): Promise<NewsletterIssueDTO | null> {
  const row = await db.query.newsletterIssue.findFirst({ where: eq(newsletterIssue.id, id) })
  return row ? mapIssueRow(row) : null
}

export async function createIssue(
  body: CreateNewsletterIssueRequest,
  createdBy: string,
): Promise<NewsletterIssueDTO> {
  const [row] = await db
    .insert(newsletterIssue)
    .values({
      subject: body.subject,
      bodyMarkdown: body.bodyMarkdown ?? "",
      createdBy,
    })
    .returning()
  return mapIssueRow(row)
}

export async function updateIssue(
  id: string,
  body: UpdateNewsletterIssueRequest,
): Promise<NewsletterIssueDTO> {
  const existing = await requireIssue(id)
  if (existing.status !== "draft" && existing.status !== "scheduled") {
    throw new NewsletterBadRequestError("Only draft or scheduled issues can be edited")
  }

  const [row] = await db
    .update(newsletterIssue)
    .set({
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.bodyMarkdown !== undefined ? { bodyMarkdown: body.bodyMarkdown } : {}),
      updatedAt: new Date(),
    })
    .where(eq(newsletterIssue.id, id))
    .returning()
  return mapIssueRow(row)
}

export async function deleteIssue(id: string, context?: AppContext): Promise<void> {
  const existing = await requireIssue(id)
  if (existing.status === "sent" || existing.status === "sending") {
    throw new NewsletterBadRequestError("Sent issues cannot be deleted")
  }
  if (context && existing.status === "scheduled") {
    await removeScheduledIssueFromRedis(context, id)
  }
  await db.delete(newsletterIssue).where(eq(newsletterIssue.id, id))
}

export async function previewIssue(id: string): Promise<string> {
  const issue = await requireIssue(id)
  // Preview uses a placeholder unsubscribe link (not tied to a real subscriber).
  return renderNewsletter({
    subject: issue.subject,
    bodyMarkdown: issue.bodyMarkdown,
    unsubscribeUrl: `${getApiUrl()}/api/newsletter/unsubscribe?token=preview`,
  })
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function sendIssueToSubscribers(issueId: string): Promise<NewsletterIssueDTO> {
  const issue = await requireIssue(issueId)

  await db
    .update(newsletterIssue)
    .set({ status: "sending", updatedAt: new Date() })
    .where(eq(newsletterIssue.id, issueId))

  try {
    const recipients = await db.query.subscriber.findMany({
      where: and(eq(subscriber.status, "active"), eq(subscriber.wantsEmail, true)),
    })

    await runWithConcurrency(recipients, SEND_CONCURRENCY, async (recipient) => {
      const unsubscribeUrl = buildUnsubscribeUrl(recipient.id)
      const html = await renderNewsletter({
        subject: issue.subject,
        bodyMarkdown: issue.bodyMarkdown,
        unsubscribeUrl,
      })
      await sendViaSes({
        to: recipient.email,
        subject: issue.subject,
        html,
        unsubscribeUrl,
      })
    })

    const [row] = await db
      .update(newsletterIssue)
      .set({
        status: "sent",
        scheduledAt: null,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(newsletterIssue.id, issueId))
      .returning()
    return mapIssueRow(row)
  } catch (error) {
    await db
      .update(newsletterIssue)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(newsletterIssue.id, issueId))
    throw error
  }
}

export async function sendIssueNow(id: string, context?: AppContext): Promise<NewsletterIssueDTO> {
  const issue = await requireIssue(id)
  if (issue.status !== "draft" && issue.status !== "scheduled" && issue.status !== "failed") {
    throw new NewsletterBadRequestError("Only draft, scheduled, or failed issues can be sent")
  }
  if (context && issue.status === "scheduled") {
    await removeScheduledIssueFromRedis(context, id)
  }
  return sendIssueToSubscribers(id)
}

export async function scheduleIssue(
  id: string,
  body: ScheduleNewsletterIssueRequest,
  context?: AppContext,
): Promise<NewsletterIssueDTO> {
  if (!context) {
    throw new NewsletterBadRequestError("Scheduling requires server context")
  }
  const issue = await requireIssue(id)
  if (issue.status !== "draft" && issue.status !== "scheduled" && issue.status !== "failed") {
    throw new NewsletterBadRequestError("Only draft, scheduled, or failed issues can be scheduled")
  }

  const scheduledAt = new Date(body.scheduledAt)
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new NewsletterBadRequestError("Invalid scheduledAt")
  }
  if (scheduledAt.getTime() <= Date.now()) {
    throw new NewsletterBadRequestError("scheduledAt must be in the future")
  }

  await addScheduledIssueToRedis(context, id, scheduledAt.getTime())

  const [row] = await db
    .update(newsletterIssue)
    .set({ status: "scheduled", scheduledAt, updatedAt: new Date() })
    .where(eq(newsletterIssue.id, id))
    .returning()

  return mapIssueRow(row)
}

export async function cancelScheduledIssue(
  id: string,
  context?: AppContext,
): Promise<NewsletterIssueDTO> {
  const issue = await requireIssue(id)
  if (issue.status !== "scheduled") {
    throw new NewsletterBadRequestError("Only scheduled issues can be canceled")
  }
  if (context) {
    await removeScheduledIssueFromRedis(context, id)
  }

  const [row] = await db
    .update(newsletterIssue)
    .set({ status: "canceled", scheduledAt: null, updatedAt: new Date() })
    .where(eq(newsletterIssue.id, id))
    .returning()

  return mapIssueRow(row)
}

// ---------------------------------------------------------------------------
// Subscribers
// ---------------------------------------------------------------------------

export async function listSubscribers(): Promise<NewsletterSubscribersSummary> {
  const rows = await db.query.subscriber.findMany({
    orderBy: [desc(subscriber.createdAt)],
  })
  const subscribers = rows.map(mapSubscriberRow)
  return {
    subscribers,
    counts: {
      total: subscribers.length,
      active: subscribers.filter((s) => s.status === "active").length,
      pending: subscribers.filter((s) => s.status === "pending").length,
      unsubscribed: subscribers.filter((s) => s.status === "unsubscribed").length,
    },
  }
}

export async function subscribe(email: string, source?: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new NewsletterBadRequestError("Valid email is required")
  }

  const existing = await db.query.subscriber.findFirst({
    where: eq(subscriber.email, normalizedEmail),
  })

  if (existing?.status === "active" && existing.wantsEmail) {
    return
  }

  if (existing) {
    await db
      .update(subscriber)
      .set({
        status: "pending",
        wantsEmail: true,
        source: source ?? existing.source,
        unsubscribedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriber.id, existing.id))
  } else {
    await db.insert(subscriber).values({
      email: normalizedEmail,
      status: "pending",
      source: source ?? null,
    })
  }

  const token = createId()
  const expiresAt = new Date(Date.now() + CONFIRM_TOKEN_TTL_MS)
  const identifier = confirmIdentifier(normalizedEmail)

  await db.delete(verification).where(eq(verification.identifier, identifier))
  await db.insert(verification).values({
    id: createId(),
    identifier,
    value: token,
    expiresAt,
  })

  const confirmUrl = `${getApiUrl()}/api/newsletter/confirm?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}`
  const html = await renderConfirmEmail({ confirmUrl })
  const client = getSesClient()
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: getSesFrom(),
      Destination: { ToAddresses: [normalizedEmail] },
      Content: {
        Simple: {
          Subject: {
            Data: "Confirm your Listening Room newsletter subscription",
            Charset: "UTF-8",
          },
          Body: { Html: { Data: html, Charset: "UTF-8" } },
        },
      },
    }),
  )
}

export async function confirmSubscription(token: string, email: string): Promise<SubscriberDTO> {
  const normalizedEmail = email.trim().toLowerCase()
  const identifier = confirmIdentifier(normalizedEmail)

  const record = await db.query.verification.findFirst({
    where: and(eq(verification.identifier, identifier), eq(verification.value, token)),
  })
  if (!record || record.expiresAt < new Date()) {
    throw new NewsletterBadRequestError("Invalid or expired confirmation link")
  }

  await db.delete(verification).where(eq(verification.id, record.id))

  const existing = await db.query.subscriber.findFirst({
    where: eq(subscriber.email, normalizedEmail),
  })

  if (!existing) {
    const [created] = await db
      .insert(subscriber)
      .values({ email: normalizedEmail, status: "active", confirmedAt: new Date() })
      .returning()
    return mapSubscriberRow(created)
  }

  const [updated] = await db
    .update(subscriber)
    .set({
      status: "active",
      wantsEmail: true,
      confirmedAt: new Date(),
      unsubscribedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(subscriber.id, existing.id))
    .returning()
  return mapSubscriberRow(updated)
}

export async function unsubscribeByToken(token: string): Promise<SubscriberDTO> {
  const subscriberId = verifyUnsubscribeToken(token)
  if (!subscriberId) {
    throw new NewsletterBadRequestError("Invalid unsubscribe link")
  }
  const row = await db.query.subscriber.findFirst({
    where: eq(subscriber.id, subscriberId),
  })
  if (!row) {
    throw new NewsletterNotFoundError("Subscriber not found")
  }
  const [updated] = await db
    .update(subscriber)
    .set({
      status: "unsubscribed",
      wantsEmail: false,
      unsubscribedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriber.id, subscriberId))
    .returning()
  return mapSubscriberRow(updated)
}

async function markSubscriberUnsubscribed(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase()
  const row = await db.query.subscriber.findFirst({
    where: eq(subscriber.email, normalizedEmail),
  })
  if (!row) return

  await db
    .update(subscriber)
    .set({
      status: "unsubscribed",
      wantsEmail: false,
      unsubscribedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriber.id, row.id))
}

// ---------------------------------------------------------------------------
// SES bounce/complaint handling (delivered via SNS notifications)
// ---------------------------------------------------------------------------

/**
 * Parse an SES event delivered inside an SNS Notification message body.
 * Permanent bounces and complaints suppress the recipient in our DB.
 */
export async function handleSesNotification(message: unknown): Promise<void> {
  const event = message as {
    notificationType?: string
    eventType?: string
    bounce?: { bounceType?: string; bouncedRecipients?: { emailAddress?: string }[] }
    complaint?: { complainedRecipients?: { emailAddress?: string }[] }
  }

  const type = event.notificationType || event.eventType

  if (type === "Bounce" && event.bounce?.bounceType === "Permanent") {
    for (const r of event.bounce.bouncedRecipients ?? []) {
      if (r.emailAddress) await markSubscriberUnsubscribed(r.emailAddress)
    }
  } else if (type === "Complaint") {
    for (const r of event.complaint?.complainedRecipients ?? []) {
      if (r.emailAddress) await markSubscriberUnsubscribed(r.emailAddress)
    }
  }
}

// ---------------------------------------------------------------------------
// Redis-backed scheduling (primary mechanism for SES)
// ---------------------------------------------------------------------------

export async function addScheduledIssueToRedis(
  context: AppContext,
  issueId: string,
  scheduledAtMs: number,
): Promise<void> {
  await context.redis.pubClient.zAdd(NEWSLETTER_SCHEDULED_REDIS_KEY, {
    score: scheduledAtMs,
    value: issueId,
  })
}

export async function removeScheduledIssueFromRedis(
  context: AppContext,
  issueId: string,
): Promise<void> {
  await context.redis.pubClient.zRem(NEWSLETTER_SCHEDULED_REDIS_KEY, issueId)
}

export async function processDueScheduledIssues(context: AppContext): Promise<void> {
  const now = Date.now()
  const dueIds = await context.redis.pubClient.zRangeByScore(
    NEWSLETTER_SCHEDULED_REDIS_KEY,
    0,
    now,
  )

  for (const issueId of dueIds) {
    try {
      const issue = await requireIssue(issueId)
      if (issue.status !== "scheduled") {
        await removeScheduledIssueFromRedis(context, issueId)
        continue
      }
      await sendIssueToSubscribers(issueId)
      await removeScheduledIssueFromRedis(context, issueId)
    } catch (error) {
      console.error(`[newsletter] Failed to send scheduled issue ${issueId}:`, error)
      await removeScheduledIssueFromRedis(context, issueId)
    }
  }
}
