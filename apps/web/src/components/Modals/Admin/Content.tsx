import { Formik } from "formik"
import React from "react"
import { useAdminStore } from "../../../state/adminStore"
import {
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  ModalBody,
  ModalFooter,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { settingsMachine } from "../../../machines/settingsMachine"
import { useMachine } from "@xstate/react"
import FormActions from "./FormActions"
import { useModalsStore } from "../../../state/modalsState"
import { useCurrentRoomHasAudio } from "../../../state/roomStore"
import RadioProtocolSelect from "../../RadioProtocolSelect"
import PlaylistDemocracySettings from "./PlaylistDemocracySettings"
import { PlaylistDemocracyConfig } from "../../../types/Room"

function Content() {
  const hasAudio = useCurrentRoomHasAudio()
  const [state] = useMachine(settingsMachine)
  const { send: modalSend } = useModalsStore()
  const { send } = useAdminStore()

  return (
    <Formik
      initialValues={{
        title: state.context.title ?? "",
        fetchMeta: state.context.fetchMeta,
        extraInfo: state.context.extraInfo ?? "",
        artwork: state.context.artwork ?? "",
        radioMetaUrl: state.context.radioMetaUrl ?? "",
        radioListenUrl: state.context.radioListenUrl ?? "",
        radioProtocol: state.context.radioProtocol ?? "shoutcastv2",
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
          <ModalBody>
            <VStack spacing={6}>
              <FormControl>
                <FormLabel>Room Name</FormLabel>
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
              </FormControl>

              {state.context.type === "radio" && (
                <>
                  <FormControl>
                    <FormLabel>Radio Metadata URL</FormLabel>
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
                    <FormHelperText>
                      The URL of the internet radio station's metadata endpoint.
                    </FormHelperText>
                  </FormControl>
                  <FormControl>
                    <FormLabel>Radio Streaming URL</FormLabel>
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
                    <FormHelperText>
                      The URL of the internet radio station's streaming audio feed.
                    </FormHelperText>
                  </FormControl>
                  <FormControl>
                    <FormLabel>Radio Protocol</FormLabel>
                    <RadioProtocolSelect value={values.radioProtocol} />
                    <FormHelperText>
                      The streaming protocol that the internet radio station is using, which is
                      required for accurate parsing of "now playing" data. If you get errors when
                      setting up the room, try changing the protocol.
                    </FormHelperText>
                  </FormControl>
                </>
              )}

              <FormControl>
                <FormLabel>Banner Content</FormLabel>
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
                <FormHelperText>Formatted with Markdown</FormHelperText>
              </FormControl>

              <FormControl>
                <FormLabel>Artwork</FormLabel>
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
                <FormHelperText>
                  URL of an image to display in the Now Playing area. Overrides any album artwork
                  from Spotify. Leave blank to use album artwork.
                </FormHelperText>
              </FormControl>

              {hasAudio && (
                <FormControl>
                  <Checkbox
                    isChecked={values.fetchMeta}
                    onChange={(e) => {
                      handleChange(e)
                      if (e.target.checked !== initialValues.fetchMeta) {
                        setTouched({ fetchMeta: true })
                      } else {
                        setTouched({ fetchMeta: false })
                      }
                    }}
                    onBlur={handleBlur}
                    value={values.fetchMeta ? 1 : 0}
                    name="fetchMeta"
                  >
                    Fetch album metadata
                  </Checkbox>
                  <FormHelperText>
                    Album Metadata (album artwork, release date, info URL) is automatically fetched
                    from Spotify based on the data from the online radio server. If you're getting
                    inaccurate data or want to display the meta directly from the online radio
                    station, disable this option.
                  </FormHelperText>
                </FormControl>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <FormActions
              onCancel={() => modalSend("CLOSE")}
              onSubmit={handleSubmit}
              dirty={dirty}
            />
          </ModalFooter>
        </form>
      )}
    </Formik>
  )
}

export default Content
