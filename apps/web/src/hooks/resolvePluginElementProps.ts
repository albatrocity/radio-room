import type {
  PluginElementKey,
  PluginElementProps,
  PluginObscureBypassRole,
  PluginTextElementKey,
  PluginUserReveals,
} from "@repo/types"

export interface ResolvedPluginElementProps extends PluginElementProps {
  /** Final obscured flag after applying viewer bypass roles */
  obscured: boolean
}

function applyUserRevealToTextElement(
  element: PluginElementKey,
  slice: PluginElementProps,
  userReveals: PluginUserReveals | undefined,
  viewerUserId: string | undefined,
): PluginElementProps {
  if (!viewerUserId || !userReveals) return slice
  if (element === "artwork") return slice

  const textKey = element as PluginTextElementKey
  const userRev = userReveals[viewerUserId]?.[textKey]
  if (!userRev) return slice

  return {
    ...slice,
    obscured: false,
    revealedBy: userRev,
  }
}

function mergeRawElementProps(
  pluginData: Record<string, unknown> | undefined,
  element: PluginElementKey,
  enabledPlugins: Set<string>,
  viewerUserId?: string,
): PluginElementProps {
  if (!pluginData) return {}

  const bypass = new Set<PluginObscureBypassRole>()
  let revealedBy: PluginElementProps["revealedBy"]
  let anyObscured = false
  let placeholder: string | undefined

  const names = Object.keys(pluginData).sort()
  for (const pluginName of names) {
    if (!enabledPlugins.has(pluginName)) continue
    const data = pluginData[pluginName] as Record<string, unknown> | undefined
    const ep = data?.elementProps as Partial<Record<PluginElementKey, PluginElementProps>> | undefined
    const userReveals = data?.userReveals as PluginUserReveals | undefined
    let slice = ep?.[element]
    if (!slice) continue

    slice = applyUserRevealToTextElement(element, slice, userReveals, viewerUserId)

    if (slice.obscureBypassRoles?.length) {
      for (const r of slice.obscureBypassRoles) bypass.add(r)
    }
    if (slice.placeholder != null) placeholder = slice.placeholder
    if (slice.revealedBy) revealedBy = slice.revealedBy
    if (slice.obscured === true) anyObscured = true
  }

  const obscured = Boolean(anyObscured && !revealedBy)

  return {
    obscured,
    obscureBypassRoles: bypass.size ? Array.from(bypass) : undefined,
    revealedBy: revealedBy ?? undefined,
    placeholder,
  }
}

function applyObscureBypass(
  raw: PluginElementProps,
  viewerRoles: PluginObscureBypassRole[],
): ResolvedPluginElementProps {
  const bypass =
    raw.obscured && raw.obscureBypassRoles?.some((r) => viewerRoles.includes(r))

  return {
    ...raw,
    obscured: Boolean(raw.obscured && !bypass),
  }
}

export interface ResolvePluginElementPropsInput {
  pluginData: Record<string, unknown> | undefined
  element: PluginElementKey
  viewerUserId?: string
  viewerRoles: PluginObscureBypassRole[]
  enabledPlugins: Set<string>
  pluginConfigs: Record<string, unknown> | undefined
}

export function resolvePluginElementProps({
  pluginData,
  element,
  viewerUserId,
  viewerRoles,
  enabledPlugins,
  pluginConfigs,
}: ResolvePluginElementPropsInput): ResolvedPluginElementProps {
  if (element === "artwork") {
    const rawArtwork = mergeRawElementProps(pluginData, "artwork", enabledPlugins, viewerUserId)
    const artist = applyObscureBypass(
      mergeRawElementProps(pluginData, "artist", enabledPlugins, viewerUserId),
      viewerRoles,
    )
    const album = applyObscureBypass(
      mergeRawElementProps(pluginData, "album", enabledPlugins, viewerUserId),
      viewerRoles,
    )

    const gttConfig = pluginConfigs?.["guess-the-tune"] as
      | { matchArtist?: boolean; matchAlbum?: boolean }
      | undefined
    const artistBlocks = Boolean(gttConfig?.matchArtist && artist.obscured)
    const albumBlocks = Boolean(gttConfig?.matchAlbum && album.obscured)
    const obscuredFromMetadata = artistBlocks || albumBlocks

    const bypass =
      obscuredFromMetadata &&
      rawArtwork.obscureBypassRoles?.some((r) => viewerRoles.includes(r))

    return {
      ...rawArtwork,
      obscured: Boolean(obscuredFromMetadata && !bypass),
    }
  }

  const raw = mergeRawElementProps(pluginData, element, enabledPlugins, viewerUserId)
  return applyObscureBypass(raw, viewerRoles)
}
