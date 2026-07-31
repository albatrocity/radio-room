/**
 * Metadata sources whose search availability follows Media Bridge CAPABILITIES
 * when the daemon is connected (design plan §7 / ADR 0077).
 * Spotify is not reported in CAPABILITIES (SDK / Spotify.app path).
 */
export const BRIDGE_CAPABILITY_TIED_METADATA_SOURCES = ["youtube", "tidal", "local"] as const

export type BridgeCapabilityTiedMetadataSource =
  (typeof BRIDGE_CAPABILITY_TIED_METADATA_SOURCES)[number]

/**
 * Room policy (`metadataSourceIds`) ∩ daemon capability for bridge rooms.
 *
 * - Daemon offline / capabilities unknown: keep server-side sources; drop `local`.
 * - Daemon connected with known CAPABILITIES: keep tied sources only if listed;
 *   always keep non-tied sources (e.g. spotify) that are in policy.
 */
export function filterMetadataSourcesByBridgeCapability(params: {
  metadataSourceIds: string[]
  bridgeConnected: boolean
  /** True after a CAPABILITIES event for this session; false when disconnected/unknown. */
  capabilitiesKnown: boolean
  availableServices: Iterable<string>
}): string[] {
  const { metadataSourceIds, bridgeConnected, capabilitiesKnown, availableServices } = params
  const services =
    availableServices instanceof Set ? availableServices : new Set(availableServices)

  if (!bridgeConnected || !capabilitiesKnown) {
    return metadataSourceIds.filter((id) => id !== "local")
  }

  const tied = new Set<string>(BRIDGE_CAPABILITY_TIED_METADATA_SOURCES)
  return metadataSourceIds.filter((id) => {
    if (!tied.has(id)) return true
    return services.has(id)
  })
}
