// ---------------------------------------------------------------------------
// Enum value types
// ---------------------------------------------------------------------------

export type SubscriberStatus = "pending" | "active" | "unsubscribed"

export type NewsletterIssueStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "canceled"
  | "failed"

// ---------------------------------------------------------------------------
// Entity DTOs (API responses)
// ---------------------------------------------------------------------------

export interface SubscriberDTO {
  id: string
  email: string
  status: SubscriberStatus
  wantsEmail: boolean
  entitlement: string
  source: string | null
  confirmedAt: string | null
  unsubscribedAt: string | null
  userId: string | null
  createdAt: string
  updatedAt: string
}

export interface NewsletterIssueDTO {
  id: string
  subject: string
  bodyMarkdown: string
  status: NewsletterIssueStatus
  scheduledAt: string | null
  sentAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export interface CreateNewsletterIssueRequest {
  subject: string
  bodyMarkdown?: string
}

export interface UpdateNewsletterIssueRequest {
  subject?: string
  bodyMarkdown?: string
}

export interface ScheduleNewsletterIssueRequest {
  scheduledAt: string
}

export interface SubscribeNewsletterRequest {
  email: string
  source?: string
}

export interface NewsletterPreviewResponse {
  html: string
}

export interface NewsletterSubscribersSummary {
  subscribers: SubscriberDTO[]
  counts: {
    total: number
    active: number
    pending: number
    unsubscribed: number
  }
}
