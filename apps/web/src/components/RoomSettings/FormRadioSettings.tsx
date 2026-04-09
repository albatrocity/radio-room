import { Field, Input, NativeSelect, VStack, Text, Checkbox } from "@chakra-ui/react"
import React from "react"

import { Room } from "../../types/Room"
import { StationProtocol } from "../../types/StationProtocol"
import { DEFAULT_LIVE_HLS_URL, DEFAULT_LIVE_WHEP_URL } from "../../lib/liveStreamDefaults"

type Props = {
  onChange: (settings: Partial<Room>) => void
  settings?: Partial<Room>
}

export default function FormRadioSettings({ onChange, settings }: Props) {
  return (
    <VStack gap={4} w="100%">
      <Field.Root>
        <Field.Label htmlFor="radioListenUrl">Radio URL</Field.Label>
        <Input
          name="radioListenUrl"
          placeholder="Radio URL"
          defaultValue={settings?.radioListenUrl}
          onChange={(e) => {
            onChange({ radioListenUrl: e.target.value })
          }}
        />
        <Field.HelperText>
          The base URL of the SHOUTCast server you want to connect to.{" "}
          <Text as="strong" fontWeight={600}>
            Needs to be a direct stream HTTPS URL.
          </Text>
        </Field.HelperText>
      </Field.Root>
      <Field.Root>
        <Field.Label htmlFor="radioMetaUrl">Radio Metadata URL</Field.Label>
        <Input
          name="radioMetaUrl"
          placeholder="Radio Metadata URL"
          defaultValue={settings?.radioMetaUrl}
          onChange={(e) => {
            onChange({ radioMetaUrl: e.target.value })
          }}
        />
        <Field.HelperText>
          The URL of the internet radio station's metadata endpoint.
        </Field.HelperText>
      </Field.Root>
      <Field.Root>
        <Field.Label htmlFor="radioProtocol">Radio Protocol</Field.Label>
        <NativeSelect.Root>
          <NativeSelect.Field
            name="radioProtocol"
            defaultValue={settings?.radioProtocol ?? "shoutcastv2"}
            onChange={(e) => onChange({ radioProtocol: e.target.value as StationProtocol })}
          >
            <option value="shoutcastv2">Shoutcast v2</option>
            <option value="shoutcastv1">Shoutcast v1</option>
            <option value="icecast">Icecast</option>
            <option value="raw">Raw Stream (icy data)</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Field.HelperText>The protocol used by the internet radio station.</Field.HelperText>
      </Field.Root>

      <Field.Root>
        <Checkbox.Root
          checked={!!settings?.liveIngestEnabled}
          onCheckedChange={(d) => onChange({ liveIngestEnabled: !!d.checked })}
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Label>Enable experimental WebRTC listen path (MediaMTX)</Checkbox.Label>
        </Checkbox.Root>
        <Field.HelperText>
          Simulcast: listeners can choose Shoutcast (default) or low-latency WebRTC. Requires WHEP and
          LL-HLS playback URLs. Now Playing stays tied to Shoutcast metadata.
        </Field.HelperText>
      </Field.Root>

      {settings?.liveIngestEnabled && (
        <>
          <Field.Root>
            <Field.Label htmlFor="liveWhepUrl">WebRTC WHEP URL</Field.Label>
            <Input
              name="liveWhepUrl"
              placeholder={DEFAULT_LIVE_WHEP_URL}
              defaultValue={settings?.liveWhepUrl ?? DEFAULT_LIVE_WHEP_URL}
              onChange={(e) => onChange({ liveWhepUrl: e.target.value })}
            />
            <Field.HelperText>MediaMTX WHEP endpoint for experimental playback.</Field.HelperText>
          </Field.Root>
          <Field.Root>
            <Field.Label htmlFor="liveHlsUrl">LL-HLS fallback URL</Field.Label>
            <Input
              name="liveHlsUrl"
              placeholder={DEFAULT_LIVE_HLS_URL}
              defaultValue={settings?.liveHlsUrl ?? DEFAULT_LIVE_HLS_URL}
              onChange={(e) => onChange({ liveHlsUrl: e.target.value })}
            />
            <Field.HelperText>Used when WebRTC cannot connect.</Field.HelperText>
          </Field.Root>
        </>
      )}
    </VStack>
  )
}
