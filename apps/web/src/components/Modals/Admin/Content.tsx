import { Formik } from "formik"
import React from "react"
import {
  Checkbox,
  Field,
  Input,
  DialogBody,
  DialogFooter,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import FormActions from "./FormActions"
import { useModalsSend, useCurrentRoomHasAudio, useSettings, useAdminSend } from "../../../hooks/useActors"
import RadioProtocolSelect from "../../RadioProtocolSelect"

function Content() {
  const hasAudio = useCurrentRoomHasAudio()
  const settings = useSettings()
  const modalSend = useModalsSend()
  const send = useAdminSend()

  return (
    <Formik
      initialValues={{
        title: settings.title ?? "",
        fetchMeta: settings.fetchMeta,
        public: settings.public ?? true,
        extraInfo: settings.extraInfo ?? "",
        artwork: settings.artwork ?? "",
        artworkStreamingOnly: settings.artworkStreamingOnly ?? false,
        radioMetaUrl: settings.radioMetaUrl ?? "",
        radioListenUrl: settings.radioListenUrl ?? "",
        radioProtocol: settings.radioProtocol ?? "shoutcastv2",
      }}
      enableReinitialize
      validate={() => {
        const errors = {}
        return errors
      }}
      onSubmit={(values) => {
        send({ type: "SET_SETTINGS", data: values } as any)
      }}
    >
      {({ values, handleChange, handleBlur, handleSubmit, setTouched, initialValues, dirty }) => (
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <VStack gap={6}>
              <Field.Root>
                <Field.Label>Room Name</Field.Label>
                <Input
                  name="title"
                  value={values.title}
                  onBlur={handleBlur}
                  onChange={(e) => {
                    handleChange(e)
                    if (e.target.value !== initialValues.title) {
                      setTouched({ title: true })
                    } else {
                      setTouched({ title: false })
                    }
                  }}
                />
              </Field.Root>

              <Field.Root>
                <Checkbox.Root
                  checked={values.public}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "public",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.public) {
                      setTouched({ public: true })
                    } else {
                      setTouched({ public: false })
                    }
                  }}
                  name="public"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>List in lobby</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  When enabled, this room will be visible in the public lobby.
                  When disabled, the room is only accessible via its direct URL.
                </Field.HelperText>
              </Field.Root>

              {settings.type === "radio" && (
                <>
                  <Field.Root>
                    <Field.Label>Radio Metadata URL</Field.Label>
                    <Input
                      name="radioMetaUrl"
                      value={values.radioMetaUrl}
                      onBlur={handleBlur}
                      onChange={(e) => {
                        handleChange(e)
                        if (e.target.value !== initialValues.radioMetaUrl) {
                          setTouched({ radioMetaUrl: true })
                        } else {
                          setTouched({ radioMetaUrl: false })
                        }
                      }}
                    />
                    <Field.HelperText>
                      The URL of the internet radio station's metadata endpoint.
                    </Field.HelperText>
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Radio Streaming URL</Field.Label>
                    <Input
                      name="radioListenUrl"
                      value={values.radioListenUrl}
                      onBlur={handleBlur}
                      onChange={(e) => {
                        handleChange(e)
                        if (e.target.value !== initialValues.radioListenUrl) {
                          setTouched({ radioListenUrl: true })
                        } else {
                          setTouched({ radioListenUrl: false })
                        }
                      }}
                    />
                    <Field.HelperText>
                      The URL of the internet radio station's streaming audio feed.
                    </Field.HelperText>
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Radio Protocol</Field.Label>
                    <RadioProtocolSelect value={values.radioProtocol} />
                    <Field.HelperText>
                      The streaming protocol that the internet radio station is using, which is
                      required for accurate parsing of "now playing" data. If you get errors when
                      setting up the room, try changing the protocol.
                    </Field.HelperText>
                  </Field.Root>
                </>
              )}

              <Field.Root>
                <Field.Label>Banner Content</Field.Label>
                <Textarea
                  name="extraInfo"
                  value={values.extraInfo}
                  onBlur={handleBlur}
                  onChange={(e) => {
                    handleChange(e)
                    if (e.target.value !== initialValues.extraInfo) {
                      setTouched({ extraInfo: true })
                    } else {
                      setTouched({ extraInfo: false })
                    }
                  }}
                />
                <Field.HelperText>Formatted with Markdown</Field.HelperText>
              </Field.Root>

              <Field.Root>
                <Field.Label>Artwork</Field.Label>
                <Input
                  name="artwork"
                  value={values.artwork}
                  placeholder="Image URL"
                  onBlur={handleBlur}
                  onChange={(e) => {
                    handleChange(e)
                    if (e.target.value !== initialValues.artwork) {
                      setTouched({ artwork: true })
                    } else {
                      setTouched({ artwork: false })
                    }
                  }}
                />
                <Field.HelperText>
                  URL of an image to display in the Now Playing area. Leave blank to use album
                  artwork from metadata sources.
                </Field.HelperText>
              </Field.Root>

              {values.artwork && hasAudio && (
                <Field.Root>
                  <Checkbox.Root
                    checked={values.artworkStreamingOnly}
                    onCheckedChange={(details) => {
                      const syntheticEvent = {
                        target: {
                          name: "artworkStreamingOnly",
                          value: details.checked,
                          type: "checkbox",
                          checked: details.checked,
                        },
                      }
                      handleChange(syntheticEvent as any)
                      if (details.checked !== initialValues.artworkStreamingOnly) {
                        setTouched({ artworkStreamingOnly: true })
                      } else {
                        setTouched({ artworkStreamingOnly: false })
                      }
                    }}
                    name="artworkStreamingOnly"
                  >
                    <Checkbox.HiddenInput onBlur={handleBlur} />
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Checkbox.Label>Only show artwork in streaming mode</Checkbox.Label>
                  </Checkbox.Root>
                  <Field.HelperText>
                    When enabled, this artwork is only used when track detection is off. Album
                    artwork from Spotify or Tidal is shown when track detection is on.
                  </Field.HelperText>
                </Field.Root>
              )}

              {hasAudio && (
                <Field.Root>
                  <Checkbox.Root
                    checked={values.fetchMeta}
                    onCheckedChange={(details) => {
                      const syntheticEvent = {
                        target: {
                          name: "fetchMeta",
                          value: details.checked,
                          type: "checkbox",
                          checked: details.checked,
                        },
                      }
                      handleChange(syntheticEvent as any)
                      if (details.checked !== initialValues.fetchMeta) {
                        setTouched({ fetchMeta: true })
                      } else {
                        setTouched({ fetchMeta: false })
                      }
                    }}
                    name="fetchMeta"
                  >
                    <Checkbox.HiddenInput onBlur={handleBlur} />
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Checkbox.Label>Track detection</Checkbox.Label>
                  </Checkbox.Root>
                  <Field.HelperText>
                    When enabled, tracks are identified from the audio stream, displayed in Now
                    Playing, and added to the playlist. When disabled, the room enters streaming
                    mode — showing room branding instead of track info.
                  </Field.HelperText>
                </Field.Root>
              )}
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

export default Content
