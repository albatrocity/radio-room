const SOURCE_LABELS: Record<string, string> = {
  spotify: "Spotify",
  tidal: "Tidal",
  youtube: "YouTube",
  local: "Library",
}

export function metadataSourceLabel(sourceId: string): string {
  return SOURCE_LABELS[sourceId] ?? sourceId.charAt(0).toUpperCase() + sourceId.slice(1)
}
