/**
 * Row identity for `trackPreviewActor` (ADR 0103). The key that requests a clip
 * and the key a row watches for status must match exactly, so both sides build
 * it here rather than inlining the template.
 *
 * `fallbackSource` covers payloads that omit `source` (browse rows inherit the
 * catalog they were listed from).
 */
export function trackPreviewKey(
  track: { id: string; source?: string },
  fallbackSource: string,
): string {
  return `${track.source?.trim() || fallbackSource}-${track.id}`
}
