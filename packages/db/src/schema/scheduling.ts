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
  index,
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
export const roomExportStatusEnum = pgEnum("room_export_status", ["draft", "published"])

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
  /** Platform admin responsible for the segment (nullable). */
  assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
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

export const roomExport = pgTable("room_export", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  showId: text("show_id")
    .notNull()
    .references(() => show.id, { onDelete: "cascade" })
    .unique(),
  markdown: text("markdown").notNull().default(""),
  status: roomExportStatusEnum("status").notNull().default("draft"),
  playlistLinks: jsonb("playlist_links"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const roomPlaylistTrack = pgTable(
  "room_playlist_track",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    showId: text("show_id")
      .notNull()
      .references(() => show.id, { onDelete: "cascade" }),
    roomExportId: text("room_export_id").references(() => roomExport.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    playedAt: timestamp("played_at", { withTimezone: true }),
    addedAt: timestamp("added_at", { withTimezone: true }),
    title: text("title").notNull().default(""),
    addedByUserId: text("added_by_user_id"),
    mediaSourceType: text("media_source_type"),
    mediaSourceTrackId: text("media_source_track_id"),
    spotifyTrackId: text("spotify_track_id"),
    tidalTrackId: text("tidal_track_id"),
    trackPayload: jsonb("track_payload"),
  },
  (table) => [
    index("room_playlist_track_show_id_idx").on(table.showId),
    unique("room_playlist_track_show_position_unique").on(table.showId, table.position),
  ],
)

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const showRelations = relations(show, ({ many, one }) => ({
  showSegments: many(showSegment),
  showTags: many(showTag),
  roomExport: one(roomExport, {
    fields: [show.id],
    references: [roomExport.showId],
  }),
  roomPlaylistTracks: many(roomPlaylistTrack),
}))

export const roomExportRelations = relations(roomExport, ({ one }) => ({
  show: one(show, { fields: [roomExport.showId], references: [show.id] }),
}))

export const roomPlaylistTrackRelations = relations(roomPlaylistTrack, ({ one }) => ({
  show: one(show, { fields: [roomPlaylistTrack.showId], references: [show.id] }),
  roomExport: one(roomExport, {
    fields: [roomPlaylistTrack.roomExportId],
    references: [roomExport.id],
  }),
}))

export const segmentRelations = relations(segment, ({ one, many }) => ({
  assignee: one(user, { fields: [segment.assignedTo], references: [user.id] }),
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
