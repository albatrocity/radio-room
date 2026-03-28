import {
  pgTable,
  pgEnum,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import { user } from "./auth"

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const showStatusEnum = pgEnum("show_status", ["draft", "ready", "published"])
export const segmentStatusEnum = pgEnum("segment_status", ["draft", "ready", "archived"])
export const tagTypeEnum = pgEnum("tag_type", ["segment", "show"])

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const show = pgTable("show", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  roomId: text("room_id"),
  status: showStatusEnum("status").notNull().default("draft"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const segment = pgTable("segment", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  title: text("title").notNull(),
  description: text("description"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  /** Approximate duration in minutes (nullable). */
  duration: integer("duration"),
  pluginPreset: jsonb("plugin_preset"),
  status: segmentStatusEnum("status").notNull().default("draft"),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const tag = pgTable(
  "tag",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    type: tagTypeEnum("type").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [unique("tag_name_type_unique").on(table.name, table.type)],
)

export const showSegment = pgTable(
  "show_segment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    showId: text("show_id")
      .notNull()
      .references(() => show.id, { onDelete: "cascade" }),
    segmentId: text("segment_id")
      .notNull()
      .references(() => segment.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** Per-show override in minutes; effective duration = durationOverride ?? segment.duration */
    durationOverride: integer("duration_override"),
  },
  (table) => [unique("show_segment_position_unique").on(table.showId, table.position)],
)

export const segmentTag = pgTable(
  "segment_tag",
  {
    segmentId: text("segment_id")
      .notNull()
      .references(() => segment.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.segmentId, table.tagId] })],
)

export const showTag = pgTable(
  "show_tag",
  {
    showId: text("show_id")
      .notNull()
      .references(() => show.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.showId, table.tagId] })],
)

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const showRelations = relations(show, ({ many }) => ({
  showSegments: many(showSegment),
  showTags: many(showTag),
}))

export const segmentRelations = relations(segment, ({ many }) => ({
  showSegments: many(showSegment),
  segmentTags: many(segmentTag),
}))

export const tagRelations = relations(tag, ({ many }) => ({
  segmentTags: many(segmentTag),
  showTags: many(showTag),
}))

export const showSegmentRelations = relations(showSegment, ({ one }) => ({
  show: one(show, { fields: [showSegment.showId], references: [show.id] }),
  segment: one(segment, { fields: [showSegment.segmentId], references: [segment.id] }),
}))

export const segmentTagRelations = relations(segmentTag, ({ one }) => ({
  segment: one(segment, { fields: [segmentTag.segmentId], references: [segment.id] }),
  tag: one(tag, { fields: [segmentTag.tagId], references: [tag.id] }),
}))

export const showTagRelations = relations(showTag, ({ one }) => ({
  show: one(show, { fields: [showTag.showId], references: [show.id] }),
  tag: one(tag, { fields: [showTag.tagId], references: [tag.id] }),
}))
