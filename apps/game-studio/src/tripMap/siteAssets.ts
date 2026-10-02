import type { TripMapInput, TripMapIssue } from "@repo/road-trip-map"

/** Client for the dev-server site asset middleware (`vite/siteAssetsPlugin.ts`, ADR 0205). */
const BASE = "/__studio/assets"

/** Required by the dev middleware's guard (`vite/studioRequestGuard.ts`). */
const STUDIO_HEADERS = { "X-Studio-Request": "1" }

export type SiteAssetKind = "image" | "model"

export type SiteAssetStatus = { configured: boolean; cdnBaseUrl?: string; message?: string }

/** An upload that hasn't reached the CDN yet. The blob URL previews it but never enters the draft. */
export type PendingSiteAsset = {
  siteId: string
  kind: SiteAssetKind
  previewUrl: string
  status: "uploading" | "failed"
  message?: string
}

export type PendingSiteAssets = Record<string, PendingSiteAsset>

export function pendingAssetKey(siteId: string, kind: SiteAssetKind): string {
  return `${siteId}:${kind}`
}

export const ASSET_ACCEPT: Record<SiteAssetKind, string> = {
  image: "image/png,image/jpeg,image/webp,image/avif,image/gif",
  model: ".glb,model/gltf-binary",
}

export async function fetchSiteAssetStatus(): Promise<SiteAssetStatus> {
  try {
    const res = await fetch(BASE, { headers: STUDIO_HEADERS })
    if (!res.ok) {
      // e.g. the guard's "only answers requests from this machine" when opened from another device.
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      return { configured: false, message: body.message ?? `Asset middleware returned HTTP ${res.status}.` }
    }
    return (await res.json()) as SiteAssetStatus
  } catch (error) {
    return { configured: false, message: String(error) }
  }
}

export async function uploadSiteAsset(
  kind: SiteAssetKind,
  file: Blob,
): Promise<{ ok: true; url: string; reused: boolean } | { ok: false; message: string }> {
  try {
    const res = await fetch(`${BASE}?kind=${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", ...STUDIO_HEADERS },
      body: file,
    })
    const body = (await res.json().catch(() => ({}))) as {
      url?: string
      reused?: boolean
      message?: string
    }
    if (res.ok && body.url) return { ok: true, url: body.url, reused: body.reused === true }
    return { ok: false, message: body.message ?? `HTTP ${res.status}` }
  } catch (error) {
    return { ok: false, message: String(error) }
  }
}

/** Unpublished art blocks Copy JSON and save: the map would ship without it. */
export function pendingAssetIssues(
  draft: TripMapInput,
  pending: PendingSiteAssets,
): TripMapIssue[] {
  return Object.values(pending).flatMap((asset): TripMapIssue[] => {
    const index = draft.sites.findIndex((s) => s.id === asset.siteId)
    if (index < 0) return []
    const name = draft.sites[index]?.name || asset.siteId
    const what = asset.kind === "image" ? "image" : "3D model"
    return [{
      severity: "error",
      code: asset.status === "uploading" ? "asset-uploading" : "asset-upload-failed",
      message:
        asset.status === "uploading"
          ? `${name}'s ${what} is still uploading.`
          : `${name}'s ${what} didn't publish: ${asset.message ?? "unknown error"}`,
      path: `sites.${index}.${asset.kind === "image" ? "imageUrl" : "model.url"}`,
      siteId: asset.siteId,
    }]
  })
}
