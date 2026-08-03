import React, { useCallback, useEffect, useState } from "react"
import { Checkbox, Field, VStack } from "@chakra-ui/react"
import { labelForMetadataSource } from "@repo/types"
import {
  normalizeBridgeMetadataSourceIds,
  seedBridgeMetadataSources,
} from "@repo/utils"

import {
  useCurrentUser,
  useMediaBridgeConnected,
  useMediaBridgeServices,
} from "../hooks/useActors"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors"

const TOGGLEABLE_SOURCES = ["youtube", "tidal", "local"] as const
type ToggleableSource = (typeof TOGGLEABLE_SOURCES)[number]

export type MetadataSourceAccessMap = Record<string, "open" | "restricted">

function asStringIds(ids: unknown): string[] {
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : []
}

/**
 * Form display normalize (ADR 0087). Uses shared policy helper with
 * `youtubeAvailable: true` so the YouTube toggle can appear; the server
 * re-normalizes with `YOUTUBE_API_KEY` on save and may drop youtube.
 */
export function normalizeBridgeMediaSourcePolicy(ids: unknown): string[] {
  return normalizeBridgeMetadataSourceIds(asStringIds(ids), { youtubeAvailable: true })
}

/** Seed defaults when switching Content form to Media Bridge (`@repo/utils`). */
export function seedBridgeMediaSourcePolicy(ids: unknown): string[] {
  return seedBridgeMetadataSources(asStringIds(ids), { youtubeAvailable: true })
}

export function normalizeMetadataSourceAccessMap(
  access: unknown,
  enabledIds: string[],
): MetadataSourceAccessMap {
  const raw =
    access && typeof access === "object" && !Array.isArray(access)
      ? (access as Record<string, unknown>)
      : {}
  const next: MetadataSourceAccessMap = {}
  for (const id of enabledIds) {
    next[id] = raw[id] === "restricted" ? "restricted" : "open"
  }
  return next
}

type Props = {
  value: string[]
  onChange: (ids: string[]) => void
  access: MetadataSourceAccessMap
  onAccessChange: (access: MetadataSourceAccessMap) => void
}

/**
 * Room policy + access baseline for Media Bridge metadata sources (ADR 0087 / 0088).
 * Controlled Formik fields — parent saves via Content form submit.
 */
export default function BridgeMediaSourcesSettings({
  value,
  onChange,
  access,
  onAccessChange,
}: Props) {
  const currentUser = useCurrentUser()
  const bridgeConnected = useMediaBridgeConnected()
  const bridgeServices = useMediaBridgeServices()
  const [tidalLinked, setTidalLinked] = useState(false)

  const policy = normalizeBridgeMediaSourcePolicy(value)
  const accessMap = normalizeMetadataSourceAccessMap(access, policy)
  const capabilitiesKnown = bridgeServices !== null

  const handleAuthEvent = useCallback(
    (event: { type: string; data?: { isAuthenticated?: boolean; serviceName?: string } }) => {
      if (
        event.type === "SERVICE_AUTHENTICATION_STATUS" &&
        event.data?.serviceName === "tidal"
      ) {
        setTidalLinked(Boolean(event.data.isAuthenticated))
      }
    },
    [],
  )

  useEffect(() => {
    const subscriptionId = `bridge-media-sources-${Date.now()}`
    subscribeById(subscriptionId, { send: handleAuthEvent })
    return () => unsubscribeById(subscriptionId)
  }, [handleAuthEvent])

  useEffect(() => {
    if (!currentUser?.userId) return
    emitToSocket("GET_USER_SERVICE_AUTHENTICATION_STATUS", {
      userId: currentUser.userId,
      serviceName: "tidal",
    })
  }, [currentUser?.userId])

  const setSourceEnabled = (sourceId: ToggleableSource, enabled: boolean) => {
    if (sourceId === "tidal" && enabled && !tidalLinked) return

    const next = new Set(normalizeBridgeMediaSourcePolicy(policy))
    next.add("spotify")
    if (enabled) next.add(sourceId)
    else next.delete(sourceId)

    const nextIds = Array.from(next)
    onChange(nextIds)
    onAccessChange(normalizeMetadataSourceAccessMap(accessMap, nextIds))
  }

  const setSourceRestricted = (sourceId: string, restricted: boolean) => {
    onAccessChange({
      ...accessMap,
      [sourceId]: restricted ? "restricted" : "open",
    })
  }

  const unavailableOnBridge = (sourceId: ToggleableSource): boolean => {
    if (!bridgeConnected || !capabilitiesKnown || !bridgeServices) return false
    return !bridgeServices.includes(sourceId)
  }

  const renderAccessControl = (sourceId: string) => (
    // Own Field.Root — nesting under the enable checkbox's Field steals clicks (Zag field context).
    <Field.Root ml={6} onClick={(e) => e.stopPropagation()}>
      <Checkbox.Root
        name={`metadataSourceAccess-${sourceId}`}
        checked={accessMap[sourceId] === "restricted"}
        onCheckedChange={(details) => {
          setSourceRestricted(sourceId, !!details.checked)
        }}
        size="sm"
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Label>Admins + plugin grants only</Checkbox.Label>
      </Checkbox.Root>
    </Field.Root>
  )

  return (
    <VStack align="stretch" gap={3}>
      <Field.Root>
        <Field.Label>Media sources</Field.Label>
        <Field.HelperText>
          Choose which sources this room searches. Mark a source as admins + plugin grants only to
          hide it from DJs unless a plugin grants access (e.g. persona or inventory item). The Media
          Bridge must also have the service enabled for it to appear in Add to Queue.
        </Field.HelperText>
      </Field.Root>

      <VStack align="stretch" gap={1}>
        <Field.Root>
          <Checkbox.Root checked disabled name="metadataSource-spotify">
            <Checkbox.HiddenInput />
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label>{labelForMetadataSource("spotify")} (always on)</Checkbox.Label>
          </Checkbox.Root>
        </Field.Root>
        {renderAccessControl("spotify")}
      </VStack>

      {TOGGLEABLE_SOURCES.map((sourceId) => {
        const checked = policy.includes(sourceId)
        const unavailable = unavailableOnBridge(sourceId)
        const tidalNeedsAuth = sourceId === "tidal" && !tidalLinked
        const disabled = tidalNeedsAuth && !checked

        return (
          <VStack key={sourceId} align="stretch" gap={1}>
            <Field.Root>
              <Checkbox.Root
                name={`metadataSource-${sourceId}`}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(details) => {
                  setSourceEnabled(sourceId, !!details.checked)
                }}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Label>{labelForMetadataSource(sourceId)}</Checkbox.Label>
              </Checkbox.Root>
              {tidalNeedsAuth && (
                <Field.HelperText>
                  Link Tidal under Authentication (Overview) before enabling for this room.
                </Field.HelperText>
              )}
              {unavailable && checked && (
                <Field.HelperText>
                  Not available on the Media Bridge right now — room opt-in is kept.
                </Field.HelperText>
              )}
              {unavailable && !checked && (
                <Field.HelperText>Not available on the Media Bridge right now.</Field.HelperText>
              )}
            </Field.Root>
            {checked && renderAccessControl(sourceId)}
          </VStack>
        )
      })}
    </VStack>
  )
}
