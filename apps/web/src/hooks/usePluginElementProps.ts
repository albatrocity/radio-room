import { useMemo } from "react"
import type {
  PluginElementKey,
  PluginElementProps,
  PluginObscureBypassRole,
} from "@repo/types"

import {
  useIsAdmin,
  useIsRoomCreator,
  useCanAddToQueue,
} from "./useActors"

/**
 * Roles the current viewer has, for resolving {@link PluginElementProps.obscureBypassRoles}.
 */
function usePluginObscureViewerRoles(): PluginObscureBypassRole[] {
  const isAdmin = useIsAdmin()
  const isCreator = useIsRoomCreator()
  const isDj = useCanAddToQueue()

  return useMemo(() => {
    const roles: PluginObscureBypassRole[] = []
    if (isAdmin) roles.push("admin")
    if (isCreator) {
      roles.push("creator")
      roles.push("owner")
    }
    if (isDj) roles.push("dj")
    return roles
  }, [isAdmin, isCreator, isDj])
}

function mergeRawElementProps(
  pluginData: Record<string, unknown> | undefined,
  element: PluginElementKey,
): PluginElementProps {
  if (!pluginData) return {}

  const bypass = new Set<PluginObscureBypassRole>()
  let revealedBy: PluginElementProps["revealedBy"]
  let anyObscured = false
  let placeholder: string | undefined

  const names = Object.keys(pluginData).sort()
  for (const pluginName of names) {
    const data = pluginData[pluginName] as Record<string, unknown> | undefined
    const ep = data?.elementProps as Partial<Record<PluginElementKey, PluginElementProps>> | undefined
    const slice = ep?.[element]
    if (!slice) continue

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

export interface ResolvedPluginElementProps extends PluginElementProps {
  /** Final obscured flag after applying viewer bypass roles */
  obscured: boolean
}

/**
 * Merges `elementProps` from all plugins under `pluginData` and resolves
 * {@link PluginElementProps.obscureBypassRoles} against the current viewer.
 */
export function usePluginElementProps(
  pluginData: Record<string, unknown> | undefined,
  element: PluginElementKey,
): ResolvedPluginElementProps {
  const viewerRoles = usePluginObscureViewerRoles()

  return useMemo(() => {
    const raw = mergeRawElementProps(pluginData, element)
    const bypass =
      raw.obscured &&
      raw.obscureBypassRoles?.some((r) => viewerRoles.includes(r))

    return {
      ...raw,
      obscured: Boolean(raw.obscured && !bypass),
    }
  }, [pluginData, element, viewerRoles])
}
