/**
 * Room `metadataSourceIds` policy for Media Bridge (ADR 0087).
 * Pure helpers — pass `youtubeAvailable` from the environment (server) or UI optimism (web).
 */

export const ALLOWED_BRIDGE_METADATA_SOURCE_IDS = [
  "spotify",
  "tidal",
  "youtube",
  "local",
  "applemusic",
] as const

/** Auto-attached on bridge enter; stripped when leaving bridge. */
export const BRIDGE_ONLY_METADATA_SOURCE_IDS = ["youtube", "local"] as const

export type BridgeMetadataSourcePolicyOptions = {
  /**
   * When false, YouTube is not seeded and is dropped on normalize.
   * Server: `Boolean(process.env.YOUTUBE_API_KEY)`.
   * Web admin form: typically `true` so the toggle can appear; save re-normalizes on the server.
   */
  youtubeAvailable?: boolean
}

function asIdList(metadataSourceIds: string[] | undefined): string[] {
  return [...(metadataSourceIds ?? [])]
}

/**
 * Normalize policy for bridge rooms: Spotify required; unknown ids dropped;
 * YouTube omitted when `youtubeAvailable` is false.
 */
export function normalizeBridgeMetadataSourceIds(
  metadataSourceIds: string[] | undefined,
  options: BridgeMetadataSourcePolicyOptions = {},
): string[] {
  const youtubeAvailable = options.youtubeAvailable ?? false
  const allowed = new Set<string>(ALLOWED_BRIDGE_METADATA_SOURCE_IDS)
  const next: string[] = []
  for (const id of metadataSourceIds ?? []) {
    if (!allowed.has(id)) continue
    if (id === "youtube" && !youtubeAvailable) continue
    if (!next.includes(id)) next.push(id)
  }
  if (!next.includes("spotify")) {
    next.unshift("spotify")
  }
  return next
}

/**
 * Seed defaults when entering / configuring bridge: add YouTube (if available) + local.
 */
export function seedBridgeMetadataSources(
  metadataSourceIds: string[] | undefined,
  options: BridgeMetadataSourcePolicyOptions = {},
): string[] {
  const youtubeAvailable = options.youtubeAvailable ?? false
  const next = asIdList(metadataSourceIds)
  if (youtubeAvailable && !next.includes("youtube")) {
    next.push("youtube")
  }
  if (!next.includes("local")) {
    next.push("local")
  }
  return next
}

/** Drop bridge-only sources when leaving the bridge controller. Keeps Spotify/Tidal/etc. */
export function stripBridgeOnlyMetadataSources(
  metadataSourceIds: string[] | undefined,
): string[] {
  const bridgeOnly = new Set<string>(BRIDGE_ONLY_METADATA_SOURCE_IDS)
  const next = (metadataSourceIds ?? []).filter((id) => !bridgeOnly.has(id))
  return next.length > 0 ? next : ["spotify"]
}

/**
 * When `playbackControllerId === "bridge"`, seed YouTube/local onto an existing policy list.
 * Otherwise return `metadataSourceIds` unchanged (including `undefined`).
 */
export function ensureBridgeMetadataSources(
  playbackControllerId: string | undefined,
  metadataSourceIds: string[] | undefined,
  options: BridgeMetadataSourcePolicyOptions = {},
): string[] | undefined {
  if (playbackControllerId !== "bridge" || !metadataSourceIds) {
    return metadataSourceIds
  }
  return seedBridgeMetadataSources(metadataSourceIds, options)
}
