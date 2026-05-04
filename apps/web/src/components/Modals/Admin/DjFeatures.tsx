import { Formik } from "formik"
import React from "react"
import {
  Checkbox,
  Field,
  DialogBody,
  DialogFooter,
  RadioGroup,
  VStack,
} from "@chakra-ui/react"
import FormActions from "./FormActions"
import { useModalsSend, useSettings, useAdminSend, useCurrentRoom } from "../../../hooks/useActors"

const SPOTIFY_CONTROLLED = "spotify-controlled" as const
const APP_CONTROLLED = "app-controlled" as const

function DjFeatures() {
  const settings = useSettings()
  const room = useCurrentRoom()
  const modalSend = useModalsSend()
  const send = useAdminSend()

  const showPlaybackMode =
    room?.type === "radio" || Boolean(room?.playbackControllerId)

  return (
    <Formik
      initialValues={{
        deputizeOnJoin: settings.deputizeOnJoin,
        // Queue display settings default to true
        showQueueCount: room?.showQueueCount !== false,
        showQueueTracks: room?.showQueueTracks !== false,
        playbackMode: room?.playbackMode ?? SPOTIFY_CONTROLLED,
      }}
      enableReinitialize
      validate={() => {
        const errors = {}
        return errors
      }}
      onSubmit={(values) => {
        const data = { ...values }
        if (!showPlaybackMode) {
          delete (data as { playbackMode?: unknown }).playbackMode
        }
        send({ type: "SET_SETTINGS", data } as any)
      }}
    >
      {({
        values,
        handleChange,
        handleBlur,
        handleSubmit,
        setFieldValue,
        setTouched,
        initialValues,
        dirty,
      }) => (
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <VStack gap={6}>
              {showPlaybackMode ? (
                <Field.Root>
                  <Field.Label>Queue playback</Field.Label>
                  <RadioGroup.Root
                    value={values.playbackMode}
                    onValueChange={(e) => {
                      const next = e.value as typeof SPOTIFY_CONTROLLED | typeof APP_CONTROLLED
                      setFieldValue("playbackMode", next)
                      if (next !== initialValues.playbackMode) {
                        setTouched({ playbackMode: true })
                      } else {
                        setTouched({ playbackMode: false })
                      }
                    }}
                    name="playbackMode"
                  >
                    <VStack gap={3} align="stretch">
                      <RadioGroup.Item value={SPOTIFY_CONTROLLED}>
                        <RadioGroup.ItemHiddenInput onBlur={handleBlur} />
                        <RadioGroup.ItemControl />
                        <RadioGroup.ItemText>Spotify-controlled</RadioGroup.ItemText>
                      </RadioGroup.Item>
                      <RadioGroup.Item value={APP_CONTROLLED}>
                        <RadioGroup.ItemHiddenInput onBlur={handleBlur} />
                        <RadioGroup.ItemControl />
                        <RadioGroup.ItemText>App-controlled</RadioGroup.ItemText>
                      </RadioGroup.Item>
                    </VStack>
                  </RadioGroup.Root>
                  <Field.HelperText>
                    Spotify-controlled adds tracks to the Spotify queue (default). App-controlled
                    keeps order in the room queue only; the app starts the next track when the
                    current one ends.
                  </Field.HelperText>
                </Field.Root>
              ) : null}

              <Field.Root>
                <Checkbox.Root
                  checked={values.deputizeOnJoin}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "deputizeOnJoin",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.deputizeOnJoin) {
                      setTouched({ deputizeOnJoin: true })
                    } else {
                      setTouched({ deputizeOnJoin: false })
                    }
                  }}
                  name="deputizeOnJoin"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Auto-deputize users</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  When enabled, users will be automatically deputized as DJs when they join. You can
                  still revoke DJ access as normal.
                </Field.HelperText>
              </Field.Root>

              <Field.Root>
                <Checkbox.Root
                  checked={values.showQueueCount}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "showQueueCount",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.showQueueCount) {
                      setTouched({ showQueueCount: true })
                    } else {
                      setTouched({ showQueueCount: false })
                    }
                  }}
                  name="showQueueCount"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Show queue count</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  Display the number of songs in the queue on the "Add to queue" button.
                </Field.HelperText>
              </Field.Root>

              <Field.Root>
                <Checkbox.Root
                  checked={values.showQueueTracks}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "showQueueTracks",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.showQueueTracks) {
                      setTouched({ showQueueTracks: true })
                    } else {
                      setTouched({ showQueueTracks: false })
                    }
                  }}
                  name="showQueueTracks"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Show queued tracks</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  Display the list of upcoming queued tracks in the playlist drawer.
                </Field.HelperText>
              </Field.Root>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <FormActions
              onCancel={() => modalSend({ type: "CLOSE" })}
              onSubmit={handleSubmit}
              dirty={dirty}
            />
          </DialogFooter>
        </form>
      )}
    </Formik>
  )
}

export default DjFeatures
