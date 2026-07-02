import { pgTable, pgEnum, text, boolean, timestamp } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { user } from "./auth"

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const subscriberStatusEnum = pgEnum("subscriber_status", [
  "pending",
  "active",
  "unsubscribed",
])

export const newsletterIssueStatusEnum = pgEnum("newsletter_issue_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "canceled",
  "failed",
])

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const subscriber = pgTable("subscriber", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text("email").notNull().unique(),
  status: subscriberStatusEnum("status").notNull().default("pending"),
  wantsEmail: boolean("wants_email").notNull().default(true),
  entitlement: text("entitlement").notNull().default("free"),
  source: text("source"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const newsletterIssue = pgTable("newsletter_issue", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  subject: text("subject").notNull(),
  bodyMarkdown: text("body_markdown").notNull().default(""),
  status: newsletterIssueStatusEnum("status").notNull().default("draft"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const subscriberRelations = relations(subscriber, ({ one }) => ({
  user: one(user, { fields: [subscriber.userId], references: [user.id] }),
}))

export const newsletterIssueRelations = relations(newsletterIssue, ({ one }) => ({
  author: one(user, { fields: [newsletterIssue.createdBy], references: [user.id] }),
}))
