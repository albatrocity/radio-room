import React, { useCallback, useEffect, useState } from "react"
import { Checkbox, Field, VStack } from "@chakra-ui/react"

import {
  useCurrentUser,
  useMediaBridgeConnected,
  useMediaBridgeServices,
} from "../hooks/useActors"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors"

const TOGGLEABLE_SOURCES = ["youtube", "tidal", "local"] as const
type ToggleableSource = (typeof TOGGLEABLE_SOURCES)[number]

const LABELS: Record<ToggleableSource | "spotify", string> = {
  spotify: "Spotify",
  youtube: "YouTube",
  tidal: "Tidal",
  local: "Library (local)",
}

export function normalizeBridgeMediaSourcePolicy(ids: unknown): string[] {
  const list = Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : []
  if (!list.includes("spotify")) list.unshift("spotify")
  return list
}

/** Mirror server `withBridgeMetadataSources` for form seeding when switching to bridge. */
export function seedBridgeMediaSourcePolicy(ids: unknown): string[] {
  const next = normalizeBridgeMediaSourcePolicy(ids)
  if (!next.includes("youtube")) next.push("youtube")
  if (!next.includes("local")) next.push("local")
  return next
}

type Props = {
  value: string[]
  onChange: (ids: string[]) => void
}

/**
 * Room policy toggles for Media Bridge metadata sources (ADR 0087).
 * Effective search = metadataSourceIds ∩ daemon CAPABILITIES.
 *
 * Controlled Formik field — parent saves via Content form submit.
 */
export default function BridgeMediaSourcesSettings({ value, onChange }: Props) {
  const currentUser = useCurrentUser()
  const bridgeConnected = useMediaBridgeConnected()
  const bridgeServices = useMediaBridgeServices()
  const [tidalLinked, setTidalLinked] = useState(false)

  const policy = normalizeBridgeMediaSourcePolicy(value)
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

    onChange(Array.from(next))
  }

  const unavailableOnBridge = (sourceId: ToggleableSource): boolean => {
    if (!bridgeConnected || !capabilitiesKnown || !bridgeServices) return false
    return !bridgeServices.includes(sourceId)
  }

  return (
    <VStack align="stretch" gap={3}>
      <Field.Root>
        <Field.Label>Media sources</Field.Label>
        <Field.HelperText>
          Choose which sources this room searches. The Media Bridge must also have the service
          enabled for it to appear in Add to Queue.
        </Field.HelperText>
      </Field.Root>

      <Field.Root>
        <Checkbox.Root checked disabled name="metadataSource-spotify">
          <Checkbox.HiddenInput />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Label>{LABELS.spotify} (always on)</Checkbox.Label>
        </Checkbox.Root>
      </Field.Root>

      {TOGGLEABLE_SOURCES.map((sourceId) => {
        const checked = policy.includes(sourceId)
        const unavailable = unavailableOnBridge(sourceId)
        const tidalNeedsAuth = sourceId === "tidal" && !tidalLinked
        const disabled = tidalNeedsAuth && !checked

        return (
          <Field.Root key={sourceId}>
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
              <Checkbox.Label>{LABELS[sourceId]}</Checkbox.Label>
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
        )
      })}
    </VStack>
  )
}
