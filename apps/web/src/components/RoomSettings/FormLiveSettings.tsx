import { Field, Input, VStack, Text } from "@chakra-ui/react"
import React from "react"

import { DEFAULT_LIVE_HLS_URL, DEFAULT_LIVE_WHEP_URL } from "../../lib/liveStreamDefaults"
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
          placeholder={DEFAULT_LIVE_WHEP_URL}
          defaultValue={settings?.radioListenUrl ?? DEFAULT_LIVE_WHEP_URL}
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
          placeholder={DEFAULT_LIVE_HLS_URL}
          defaultValue={settings?.radioMetaUrl ?? DEFAULT_LIVE_HLS_URL}
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
