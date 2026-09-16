"use client"

import { Box, Button, Field, HStack, Input, NativeSelect, Stack, Text } from "@chakra-ui/react"
import type { StoredArtifact } from "@repo/types"
import {
  artifactKindBadge,
  artifactSummaryLabel,
  emptyStashLine,
  readArtifactContents,
} from "@repo/game-logic"
import { useEffect, useMemo, useState } from "react"
import * as studioActions from "../../studio/studioActions"
import type { StudioRoom } from "../../studio/studioRoom"
import { toaster } from "../ui/toaster"

function publicLabel(a: StoredArtifact, containerName?: string): string {
  const contents = readArtifactContents(a)
  if (contents.length === 0) {
    return a.label?.trim() || emptyStashLine(containerName)
  }
  return a.label?.trim() || artifactSummaryLabel(contents)
}

function rowSummary(a: StoredArtifact, containerName?: string): string {
  const contents = readArtifactContents(a)
  if (contents.length === 0) return emptyStashLine(containerName)
  return artifactSummaryLabel(contents)
}

export type StoredArtifactsPanelProps = {
  room: StudioRoom
}

export function StoredArtifactsPanel({ room }: StoredArtifactsPanelProps) {
  const artifacts = room.storedArtifacts
  const [artifactId, setArtifactId] = useState("")
  const [password, setPassword] = useState("")
  const [retrievingUserId, setRetrievingUserId] = useState<string | null>(null)

  const userIds = useMemo(() => [...room.users.keys()], [room.snapshotEpoch])
  const effectiveRetriever = retrievingUserId ?? userIds[0] ?? ""

  useEffect(() => {
    if (artifacts.length === 0) return
    setArtifactId((prev) =>
      prev && artifacts.some((a) => a.id === prev) ? prev : artifacts[0]!.id,
    )
  }, [artifacts])

  useEffect(() => {
    if (userIds.length === 0) return
    setRetrievingUserId((prev) => (prev && userIds.includes(prev) ? prev : userIds[0]!))
  }, [userIds])

  if (artifacts.length === 0) {
    return (
      <Text fontSize="sm" color="fg.muted">
        No stored artifacts yet — use Van Cubby, Merch Cash Box, Road Case, or Trailer from a user
        card.
      </Text>
    )
  }

  const submit = () => {
    const pw = password.trim()
    if (!artifactId || !pw || !effectiveRetriever) {
      toaster.create({
        title: "Missing fields",
        description: "Select an artifact, user, and enter the password.",
        type: "info",
      })
      return
    }
    void (async () => {
      try {
        const res = await studioActions.retrieveArtifact(artifactId, pw, effectiveRetriever)
        toaster.create({
          title: res.success ? "Retrieved" : "Failed",
          description: res.message,
          type: res.success ? "success" : "error",
        })
        if (res.success) {
          setPassword("")
        }
      } catch (e) {
        toaster.create({ title: "Error", description: String(e), type: "error" })
      }
    })()
  }

  return (
    <Stack gap="3" fontSize="sm">
      <Stack gap="1">
        {artifacts.map((a) => {
          const contents = readArtifactContents(a)
          const containerName = a.containerDefinitionId
            ? room.getDefinition(a.containerDefinitionId)?.name
            : undefined
          return (
            <Box key={a.id} borderWidth="1px" borderRadius="sm" p="2">
              <Text fontWeight="medium">{publicLabel(a, containerName)}</Text>
              <Text fontSize="xs" color="fg.muted">
                {artifactKindBadge(contents)}
                {contents.length === 0 || a.label?.trim() ? ` · ${rowSummary(a, containerName)}` : ""}{" "}
                · id {a.id.slice(0, 8)}… · stored by {a.storedByUsername}
              </Text>
            </Box>
          )
        })}
      </Stack>

      <Field.Root gap="1">
        <Field.Label fontSize="xs">Retrieve as user</Field.Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field
            value={effectiveRetriever}
            onChange={(e) => setRetrievingUserId(e.target.value)}
          >
            {userIds.map((id) => (
              <option key={id} value={id}>
                {room.users.get(id)?.username ?? id}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>

      <Field.Root gap="1">
        <Field.Label fontSize="xs">Artifact to retrieve</Field.Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field value={artifactId} onChange={(e) => setArtifactId(e.target.value)}>
            {artifacts.map((a) => {
              const containerName = a.containerDefinitionId
                ? room.getDefinition(a.containerDefinitionId)?.name
                : undefined
              return (
                <option key={a.id} value={a.id}>
                  {publicLabel(a, containerName)} ({a.id.slice(0, 8)}…)
                </option>
              )
            })}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>

      <HStack gap="2" align="flex-end">
        <Input
          flex="1"
          size="sm"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <Button size="sm" onClick={submit} disabled={!password.trim()}>
          Retrieve
        </Button>
      </HStack>
    </Stack>
  )
}
