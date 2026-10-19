import type { PhysicalMediaFormat, SharedPlayback } from "@repo/types"

/** Plugin-storage key (room-scoped) for shared playback, one entry per owner (ADR 0215). */
export const SHARED_PLAYBACK_KEY = "shared-playback"

export type SharedPlaybackEntries = Record<string, SharedPlayback>

export type SharedPlaybackFormats = {
  formats: ReadonlySet<PhysicalMediaFormat>
  gentle: ReadonlySet<PhysicalMediaFormat>
}

export const NO_SHARED_PLAYBACK: SharedPlaybackFormats = { formats: new Set(), gentle: new Set() }

/** `entries` with `ownerId` replaced, or removed when `formats` is empty. */
export function withSharedPlayback(
  entries: SharedPlaybackEntries,
  ownerId: string,
  playback: SharedPlayback,
): SharedPlaybackEntries {
  const next = { ...entries }
  delete next[ownerId]
  if (playback.formats.length === 0) return next
  next[ownerId] = {
    formats: [...new Set(playback.formats)],
    ...(playback.gentle ? { gentle: true } : {}),
  }
  return next
}

/** Union of every owner's formats, and of the gentle owners' formats. */
export function sharedPlaybackFormats(entries: SharedPlaybackEntries): SharedPlaybackFormats {
  const formats = new Set<PhysicalMediaFormat>()
  const gentle = new Set<PhysicalMediaFormat>()
  for (const entry of Object.values(entries)) {
    for (const format of entry.formats) {
      formats.add(format)
      if (entry.gentle) gentle.add(format)
    }
  }
  return { formats, gentle }
}
