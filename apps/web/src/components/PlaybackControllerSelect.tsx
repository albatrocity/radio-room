import React from "react"
import { Field, NativeSelect } from "@chakra-ui/react"
import FieldSelect from "./Fields/FieldSelect"

export type PlaybackControllerOption = "spotify" | "bridge"

type BaseProps = {
  helperText?: boolean
}

type FormikProps = BaseProps & {
  name: string
  value: string
  onChange?: never
}

type ControlledProps = BaseProps & {
  name?: string
  value: string
  onChange: (value: PlaybackControllerOption) => void
}

type Props = FormikProps | ControlledProps

function Options() {
  return (
    <>
      <option value="spotify">Spotify Connect</option>
      <option value="bridge">Media Bridge</option>
    </>
  )
}

/**
 * Playback controller for radio/live rooms: Spotify Connect (API) or the Mac media bridge daemon.
 */
export default function PlaybackControllerSelect(props: Props) {
  const showHelper = props.helperText !== false
  const controlledOnChange = "onChange" in props ? props.onChange : undefined

  return (
    <Field.Root>
      <Field.Label htmlFor={props.name ?? "playbackControllerId"}>Playback controller</Field.Label>
      {controlledOnChange ? (
        <NativeSelect.Root>
          <NativeSelect.Field
            name={props.name ?? "playbackControllerId"}
            value={props.value || "spotify"}
            onChange={(e) => controlledOnChange(e.target.value as PlaybackControllerOption)}
          >
            <Options />
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      ) : (
        <FieldSelect name={props.name!}>
          <Options />
        </FieldSelect>
      )}
      {showHelper && (
        <Field.HelperText>
          Spotify Connect drives playback via the Spotify Web API. Media Bridge uses the Listening
          Room bridge daemon on a DJ Mac (Spotify Web Playback SDK, YouTube, local files, etc.).
        </Field.HelperText>
      )}
    </Field.Root>
  )
}
