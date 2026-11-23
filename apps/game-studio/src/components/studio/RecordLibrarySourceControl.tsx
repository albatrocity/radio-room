"use client"

import { Button, HStack, Input, Stack, Text } from "@chakra-ui/react"
import { useCallback, useEffect, useState } from "react"
import {
  browseRecordLibraryPath,
  getRecordLibrarySource,
  setRecordLibrarySource,
  type StudioRecordLibrarySource,
} from "../../studio/bridgeClient"
import { studioBridgeUrl } from "../../tripMap/tripMapDraft"

function statusLine(source: StudioRecordLibrarySource | null, busy: string | null): string {
  if (busy) return busy
  if (!source) return "Checking library…"
  if (source.mode === "live") {
    return source.ok ? "Live Navidrome" : (source.error ?? "Live Navidrome unavailable")
  }
  if (!source.ok) return source.error ?? "Database unavailable"
  if (typeof source.albumCount === "number") {
    return `${source.albumCount} album${source.albumCount === 1 ? "" : "s"}`
  }
  return "Database ready"
}

export function RecordLibrarySourceControl() {
  const bridge = studioBridgeUrl()
  const [source, setSource] = useState<StudioRecordLibrarySource | null>(null)
  const [pathDraft, setPathDraft] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await getRecordLibrarySource(bridge)
      setSource(next)
      if (next.path) setPathDraft(next.path)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load library source")
    }
  }, [bridge])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const apply = async (mode: "live" | "file", path?: string | null) => {
    setBusy(mode === "live" ? "Switching to live…" : "Opening database…")
    setError(null)
    try {
      const next = await setRecordLibrarySource(bridge, {
        mode,
        ...(path !== undefined ? { path } : {}),
      })
      setSource(next)
      if (next.path) setPathDraft(next.path)
      if (!next.ok && next.error) setError(next.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch library source")
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const choose = async () => {
    setBusy("Choose a file…")
    setError(null)
    try {
      const result = await browseRecordLibraryPath(bridge)
      if ("cancelled" in result) return
      setPathDraft(result.path)
      setBusy(null)
      await apply("file", result.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : "File chooser failed")
    } finally {
      setBusy(null)
    }
  }

  const switchToFile = () => {
    const path = pathDraft.trim() || source?.path || null
    if (path) {
      void apply("file", path)
      return
    }
    setSource((prev) => ({
      mode: "file",
      path: prev?.path ?? null,
      ok: false,
      error: "Choose a navidrome.db file",
    }))
    setError(null)
  }

  const mode = source?.mode ?? "live"

  return (
    <Stack gap="1" align="flex-end" maxW="md">
      <HStack gap="1" wrap="wrap" justify="flex-end">
        <Button
          size="xs"
          variant={mode === "live" ? "subtle" : "ghost"}
          aria-pressed={mode === "live"}
          disabled={!!busy}
          onClick={() => void apply("live")}
        >
          Live
        </Button>
        <Button
          size="xs"
          variant={mode === "file" ? "subtle" : "ghost"}
          aria-pressed={mode === "file"}
          disabled={!!busy}
          onClick={switchToFile}
        >
          Database
        </Button>
      </HStack>
      {mode === "file" ? (
        <HStack gap="1" wrap="wrap" justify="flex-end">
          <Input
            size="xs"
            w="xs"
            maxW="100%"
            value={pathDraft}
            onChange={(e) => setPathDraft(e.target.value)}
            placeholder="/path/to/navidrome.db"
            aria-label="Navidrome database path"
            disabled={!!busy}
          />
          <Button size="xs" variant="outline" disabled={!!busy} onClick={() => void choose()}>
            Choose…
          </Button>
          <Button
            size="xs"
            disabled={!!busy || !pathDraft.trim()}
            onClick={() => void apply("file", pathDraft.trim())}
          >
            Use
          </Button>
        </HStack>
      ) : null}
      <Text fontSize="xs" color={error ? "fg.error" : "fg.muted"} textAlign="right">
        {error ?? statusLine(source, busy)}
      </Text>
    </Stack>
  )
}
