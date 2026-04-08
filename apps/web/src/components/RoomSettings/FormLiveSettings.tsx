import { Field, Input, VStack, Text } from "@chakra-ui/react"
import React from "react"

import { Room } from "../../types/Room"

type Props = {
  onChange: (settings: Partial<Room>) => void
  settings?: Partial<Room>
}

export default function FormLiveSettings({ onChange, settings }: Props) {
  return (
    <VStack gap={4} w="100%">
      <Text fontSize="sm" color="fg.muted">
        Live rooms use RTMP ingest via MediaMTX. Listeners connect via WebRTC for sub-second latency,
        with LL-HLS as a fallback. Track metadata is forwarded from your music player via the
        local-remote daemon.
      </Text>
      <Field.Root>
        <Field.Label htmlFor="radioListenUrl">WebRTC WHEP URL</Field.Label>
        <Input
          name="radioListenUrl"
          placeholder="http://mediamtx:8889/stream/whep"
          defaultValue={settings?.radioListenUrl}
          onChange={(e) => {
            onChange({ radioListenUrl: e.target.value })
          }}
        />
        <Field.HelperText>
          The WHEP endpoint for WebRTC playback from your MediaMTX server.
        </Field.HelperText>
      </Field.Root>
      <Field.Root>
        <Field.Label htmlFor="radioMetaUrl">LL-HLS Fallback URL</Field.Label>
        <Input
          name="radioMetaUrl"
          placeholder="http://mediamtx:8888/stream/index.m3u8"
          defaultValue={settings?.radioMetaUrl}
          onChange={(e) => {
            onChange({ radioMetaUrl: e.target.value })
          }}
        />
        <Field.HelperText>
          The HLS endpoint used as a fallback when WebRTC cannot connect.
        </Field.HelperText>
      </Field.Root>
    </VStack>
  )
}
