import { ITEM_MODEL_FILENAME_PATTERN } from "@repo/types"

const DEFAULT_ASSET_CDN_BASE_URL = "https://cdn.listeningroom.club"

export function assetCdnBaseUrl(): string {
  const configured = String(import.meta.env.VITE_ASSET_CDN_BASE_URL ?? "").trim()
  return (configured || DEFAULT_ASSET_CDN_BASE_URL).replace(/\/+$/, "")
}

/**
 * CDN URL for an item's GLB (ADR 0199). `model` must be a bare `.glb` filename;
 * anything else (paths, other extensions) resolves to `undefined` so the caller
 * keeps the Lucide icon.
 */
export function resolveItemModelUrl(
  shortId: string | undefined,
  model: string | undefined,
  baseUrl: string = assetCdnBaseUrl(),
): string | undefined {
  const id = shortId?.trim()
  const file = model?.trim()
  if (!id || !file || !ITEM_MODEL_FILENAME_PATTERN.test(file)) return undefined
  return `${baseUrl.replace(/\/+$/, "")}/assets/items/${encodeURIComponent(id)}/${file}`
}
