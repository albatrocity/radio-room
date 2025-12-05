import { Formik } from "formik"
import React from "react"
import { useAdminStore } from "../../../state/adminStore"
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
import { useModalsSend, useCurrentRoomHasAudio, useSettings } from "../../../hooks/useActors"
import RadioProtocolSelect from "../../RadioProtocolSelect"

function Content() {
  const hasAudio = useCurrentRoomHasAudio()
  const settings = useSettings()
  const modalSend = useModalsSend()
  const { send } = useAdminStore()

  return (
    <Formik
      initialValues={{
        title: settings.title ?? "",
        fetchMeta: settings.fetchMeta,
        extraInfo: settings.extraInfo ?? "",
        artwork: settings.artwork ?? "",
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
                  URL of an image to display in the Now Playing area. Overrides any album artwork
                  from Spotify. Leave blank to use album artwork.
                </Field.HelperText>
              </Field.Root>

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
                    <Checkbox.Label>Fetch album metadata</Checkbox.Label>
                  </Checkbox.Root>
                  <Field.HelperText>
                    Album Metadata (album artwork, release date, info URL) is automatically fetched
                    from Spotify based on the data from the online radio server. If you're getting
                    inaccurate data or want to display the meta directly from the online radio
                    station, disable this option.
                  </Field.HelperText>
                </Field.Root>
              )}
            </VStack>
          </DialogBody>
          <DialogFooter>
            <FormActions
              onCancel={() => modalSend("CLOSE")}
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
