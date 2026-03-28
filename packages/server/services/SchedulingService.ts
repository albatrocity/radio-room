import { db, show, segment, tag, showSegment, segmentTag, showTag } from "@repo/db"
import { eq, and, ilike, gte, lte, inArray, sql, exists, notExists } from "drizzle-orm"
import type {
  ShowFilters,
  SegmentFilters,
  CreateShowRequest,
  UpdateShowRequest,
  CreateSegmentRequest,
  UpdateSegmentRequest,
  CreateTagRequest,
  TagType,
} from "@repo/types"

// ---------------------------------------------------------------------------
// Shows
// ---------------------------------------------------------------------------

export async function findShows(filters: ShowFilters = {}) {
  const conditions = []

  if (filters.search) {
    conditions.push(ilike(show.title, `%${filters.search}%`))
  }
  if (filters.status) {
    conditions.push(eq(show.status, filters.status))
  }
  if (filters.startDate) {
    conditions.push(gte(show.startTime, new Date(filters.startDate)))
  }
  if (filters.endDate) {
    conditions.push(lte(show.startTime, new Date(filters.endDate)))
  }

  const rows = await db.query.show.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      showTags: { with: { tag: true } },
    },
    orderBy: (s, { desc }) => [desc(s.startTime)],
  })

  return rows.map((row) => ({
    ...row,
    tags: row.showTags.map((st) => st.tag),
  }))
}

export async function findShowById(id: string) {
  const row = await db.query.show.findFirst({
    where: eq(show.id, id),
    with: {
      showSegments: {
        with: { segment: { with: { segmentTags: { with: { tag: true } } } } },
        orderBy: (ss, { asc }) => [asc(ss.position)],
      },
      showTags: { with: { tag: true } },
    },
  })

  if (!row) return null

  return {
    ...row,
    tags: row.showTags.map((st) => st.tag),
    segments: row.showSegments.map((ss) => ({
      id: ss.id,
      segmentId: ss.segmentId,
      position: ss.position,
      durationOverride: ss.durationOverride ?? null,
      segment: {
        ...ss.segment,
        tags: ss.segment.segmentTags.map((st) => st.tag),
      },
    })),
  }
}

export async function createShow(data: CreateShowRequest, createdBy: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(show)
      .values({
        title: data.title,
        description: data.description ?? null,
        startTime: new Date(data.startTime),
        endTime: data.endTime ? new Date(data.endTime) : null,
        roomId: data.roomId ?? null,
        status: data.status ?? "working",
        createdBy,
      })
      .returning()

    if (data.tagIds && data.tagIds.length > 0) {
      await tx
        .insert(showTag)
        .values(data.tagIds.map((tagId) => ({ showId: row.id, tagId })))
    }

    return row
  })
}

export async function updateShow(id: string, data: UpdateShowRequest) {
  return db.transaction(async (tx) => {
    const values: Record<string, unknown> = { updatedAt: new Date() }

    if (data.title !== undefined) values.title = data.title
    if (data.description !== undefined) values.description = data.description
    if (data.startTime !== undefined) values.startTime = new Date(data.startTime)
    if (data.endTime !== undefined) values.endTime = data.endTime ? new Date(data.endTime) : null
    if (data.roomId !== undefined) values.roomId = data.roomId
    if (data.status !== undefined) values.status = data.status

    const [row] = await tx.update(show).set(values).where(eq(show.id, id)).returning()
    if (!row) return null

    if (data.tagIds !== undefined) {
      await tx.delete(showTag).where(eq(showTag.showId, id))
      if (data.tagIds.length > 0) {
        await tx
          .insert(showTag)
          .values(data.tagIds.map((tagId) => ({ showId: id, tagId })))
      }
    }

    return row
  })
}

export async function deleteShow(id: string) {
  const [row] = await db.delete(show).where(eq(show.id, id)).returning()
  return row ?? null
}

export async function reorderShowSegments(showId: string, segmentIds: string[]) {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({
        segmentId: showSegment.segmentId,
        durationOverride: showSegment.durationOverride,
      })
      .from(showSegment)
      .where(eq(showSegment.showId, showId))

    const overrideBySegmentId = new Map(
      existing.map((r) => [r.segmentId, r.durationOverride ?? null]),
    )

    await tx.delete(showSegment).where(eq(showSegment.showId, showId))

    if (segmentIds.length === 0) return []

    const rows = await tx
      .insert(showSegment)
      .values(
        segmentIds.map((segmentId, index) => ({
          showId,
          segmentId,
          position: index,
          durationOverride: overrideBySegmentId.get(segmentId) ?? null,
        })),
      )
      .returning()

    return rows
  })
}

export async function updateShowSegmentDuration(
  showId: string,
  segmentId: string,
  durationOverride: number | null,
) {
  const [row] = await db
    .update(showSegment)
    .set({ durationOverride })
    .where(and(eq(showSegment.showId, showId), eq(showSegment.segmentId, segmentId)))
    .returning()

  return row ?? null
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export async function findSegments(filters: SegmentFilters = {}) {
  const conditions = []

  if (filters.search) {
    conditions.push(ilike(segment.title, `%${filters.search}%`))
  }
  if (filters.status) {
    conditions.push(eq(segment.status, filters.status))
  }
  if (filters.isRecurring !== undefined) {
    conditions.push(eq(segment.isRecurring, filters.isRecurring))
  }
  if (filters.tags && filters.tags.length > 0) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(segmentTag)
          .where(and(eq(segmentTag.segmentId, segment.id), inArray(segmentTag.tagId, filters.tags))),
      ),
    )
  }
  if (filters.scheduled === "scheduled") {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(showSegment)
          .where(eq(showSegment.segmentId, segment.id)),
      ),
    )
  } else if (filters.scheduled === "unscheduled") {
    conditions.push(
      notExists(
        db
          .select({ one: sql`1` })
          .from(showSegment)
          .where(eq(showSegment.segmentId, segment.id)),
      ),
    )
  }

  const rows = await db.query.segment.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      segmentTags: { with: { tag: true } },
    },
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  })

  return rows.map((row) => ({
    ...row,
    tags: row.segmentTags.map((st) => st.tag),
  }))
}

export async function findSegmentById(id: string) {
  const row = await db.query.segment.findFirst({
    where: eq(segment.id, id),
    with: {
      segmentTags: { with: { tag: true } },
      showSegments: {
        with: {
          show: { columns: { id: true, title: true, startTime: true, status: true } },
        },
      },
    },
  })

  if (!row) return null

  return {
    ...row,
    tags: row.segmentTags.map((st) => st.tag),
    shows: row.showSegments.map((ss) => ss.show),
  }
}

export async function createSegment(data: CreateSegmentRequest, createdBy: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(segment)
      .values({
        title: data.title,
        description: data.description ?? null,
        isRecurring: data.isRecurring ?? false,
        duration: data.duration ?? null,
        pluginPreset: data.pluginPreset ?? null,
        status: data.status ?? "draft",
        createdBy,
      })
      .returning()

    if (data.tagIds && data.tagIds.length > 0) {
      await tx
        .insert(segmentTag)
        .values(data.tagIds.map((tagId) => ({ segmentId: row.id, tagId })))
    }

    return row
  })
}

export async function updateSegment(id: string, data: UpdateSegmentRequest) {
  return db.transaction(async (tx) => {
    const values: Record<string, unknown> = { updatedAt: new Date() }

    if (data.title !== undefined) values.title = data.title
    if (data.description !== undefined) values.description = data.description
    if (data.isRecurring !== undefined) values.isRecurring = data.isRecurring
    if (data.duration !== undefined) values.duration = data.duration
    if (data.pluginPreset !== undefined) values.pluginPreset = data.pluginPreset
    if (data.status !== undefined) values.status = data.status

    const [row] = await tx.update(segment).set(values).where(eq(segment.id, id)).returning()
    if (!row) return null

    if (data.tagIds !== undefined) {
      await tx.delete(segmentTag).where(eq(segmentTag.segmentId, id))
      if (data.tagIds.length > 0) {
        await tx
          .insert(segmentTag)
          .values(data.tagIds.map((tagId) => ({ segmentId: id, tagId })))
      }
    }

    return row
  })
}

export async function deleteSegment(id: string) {
  const [row] = await db.delete(segment).where(eq(segment.id, id)).returning()
  return row ?? null
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function findTags(type?: TagType) {
  if (type) {
    return db.query.tag.findMany({
      where: eq(tag.type, type),
      orderBy: (t, { asc }) => [asc(t.name)],
    })
  }
  return db.query.tag.findMany({
    orderBy: (t, { asc }) => [asc(t.name)],
  })
}

export async function createTag(data: CreateTagRequest) {
  const [row] = await db
    .insert(tag)
    .values({ name: data.name, type: data.type })
    .returning()
  return row
}

export async function deleteTag(id: string) {
  const [row] = await db.delete(tag).where(eq(tag.id, id)).returning()
  return row ?? null
}
