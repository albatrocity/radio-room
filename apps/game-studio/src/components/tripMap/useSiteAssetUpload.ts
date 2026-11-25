import { useState, type Dispatch, type SetStateAction } from "react"
import type { TripMapInput } from "@repo/road-trip-map"
import { toaster } from "../ui/toaster"
import { updateSite } from "../../tripMap/tripMapDraft"
import {
  pendingAssetKey,
  uploadSiteAsset,
  type PendingSiteAssets,
  type SiteAssetKind,
} from "../../tripMap/siteAssets"

/**
 * CDN upload for a site image or model. The editor keeps the draft; this hook
 * owns the in-flight preview and revoke of its object URLs.
 */
export function useSiteAssetUpload(setDraft: Dispatch<SetStateAction<TripMapInput>>) {
  const [pendingAssets, setPendingAssets] = useState<PendingSiteAssets>({})

  const uploadAsset = async (siteId: string, kind: SiteAssetKind, file: File) => {
    const key = pendingAssetKey(siteId, kind)
    const previewUrl = URL.createObjectURL(file)
    setPendingAssets((p) => {
      if (p[key]) URL.revokeObjectURL(p[key].previewUrl)
      return { ...p, [key]: { siteId, kind, previewUrl, status: "uploading" } }
    })
    const result = await uploadSiteAsset(kind, file)
    if (result.ok) {
      setDraft((d) =>
        updateSite(
          d,
          siteId,
          kind === "image" ? { imageUrl: result.url } : { model: { url: result.url } },
        ),
      )
      setPendingAssets((p) => {
        if (p[key]?.previewUrl !== previewUrl) return p
        URL.revokeObjectURL(previewUrl)
        const { [key]: _done, ...rest } = p
        return rest
      })
      toaster.create({
        title: result.reused ? "Already on the CDN" : "Published to the CDN",
        type: "success",
      })
    } else {
      setPendingAssets((p) =>
        p[key]?.previewUrl === previewUrl
          ? { ...p, [key]: { ...p[key], status: "failed", message: result.message } }
          : p,
      )
    }
  }

  const discardPending = (siteId: string, kind: SiteAssetKind) => {
    const key = pendingAssetKey(siteId, kind)
    setPendingAssets((p) => {
      if (!p[key]) return p
      URL.revokeObjectURL(p[key].previewUrl)
      const { [key]: _gone, ...rest } = p
      return rest
    })
  }

  return { pendingAssets, uploadAsset, discardPending }
}
