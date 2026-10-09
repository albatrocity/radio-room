export type TrackMeta = {
  title: string
  artist: string
  album: string
}

/** Pipe format expected by `@repo/media-source-shoutcast`. */
export function formatStreamTitle(meta: TrackMeta): string {
  return `${meta.title} | ${meta.artist} | ${meta.album}`
}

/**
 * Build an ICY metadata block: 1 length byte (units of 16) + padded payload.
 * Payload shape: `StreamTitle='…';`
 */
export function buildIcyMetadataBlock(streamTitle: string): Buffer {
  const payload = `StreamTitle='${streamTitle.replace(/'/g, "")}';`
  const lengthUnits = Math.ceil(Buffer.byteLength(payload, "utf8") / 16)
  const block = Buffer.alloc(1 + lengthUnits * 16, 0)
  block[0] = lengthUnits
  block.write(payload, 1, "utf8")
  return block
}

export function applyCorsHeaders(
  headers: Record<string, string | number>,
): Record<string, string | number> {
  return {
    ...headers,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "icy-metaint,icy-name,icy-br,content-type",
  }
}

export function wantsIcyMetadata(headerValue: string | undefined): boolean {
  return headerValue?.trim() === "1"
}
