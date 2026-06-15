import { useMemo } from "react"
import type { PluginElementKey } from "@repo/types"

import {
  useIsAdmin,
  useIsRoomCreator,
  useCanAddToQueue,
  usePluginConfigs,
  useCurrentUser,
} from "./useActors"
import { resolvePluginElementProps } from "./resolvePluginElementProps"
import type { ResolvedPluginElementProps } from "./resolvePluginElementProps"
import type { PluginObscureBypassRole } from "@repo/types"

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

export type { ResolvedPluginElementProps } from "./resolvePluginElementProps"

/**
 * Merges `elementProps` from all plugins under `pluginData` and resolves
 * {@link PluginElementProps.obscureBypassRoles} against the current viewer.
 * Applies {@link PluginAugmentationData.userReveals} for the current user when present.
 */
export function usePluginElementProps(
  pluginData: Record<string, unknown> | undefined,
  element: PluginElementKey,
): ResolvedPluginElementProps {
  const viewerRoles = usePluginObscureViewerRoles()
  const currentUser = useCurrentUser()
  const viewerUserId = currentUser?.userId
  const pluginConfigs = usePluginConfigs()
  const enabledPlugins = useMemo(() => {
    const enabled = new Set<string>()
    if (!pluginConfigs) return enabled

    for (const [name, config] of Object.entries(pluginConfigs)) {
      if ((config as { enabled?: boolean } | undefined)?.enabled === true) {
        enabled.add(name)
      }
    }

    return enabled
  }, [pluginConfigs])

  return useMemo(
    () =>
      resolvePluginElementProps({
        pluginData,
        element,
        viewerUserId,
        viewerRoles,
        enabledPlugins,
        pluginConfigs,
      }),
    [pluginData, element, viewerRoles, enabledPlugins, viewerUserId, pluginConfigs],
  )
}
