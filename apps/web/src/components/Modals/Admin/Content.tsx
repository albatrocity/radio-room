import { Formik } from "formik"
import React, { useCallback, useRef, useState } from "react"
import {
  Box,
  Button,
  Checkbox,
  Field,
  HStack,
  Icon,
  Image,
  Input,
  DialogBody,
  DialogFooter,
  Spinner,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { LuImagePlus, LuTrash2 } from "react-icons/lu"
import FormActions from "./FormActions"
import {
  useModalsSend,
  useCurrentRoom,
  useCurrentRoomHasAudio,
  useSettings,
  useAdminSend,
} from "../../../hooks/useActors"
import RadioProtocolSelect from "../../RadioProtocolSelect"
import { uploadArtwork } from "../../../lib/serverApi"

function Content() {
  const room = useCurrentRoom()
  const hasAudio = useCurrentRoomHasAudio()
  const settings = useSettings()
  const modalSend = useModalsSend()
  const send = useAdminSend()
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleArtworkUpload = useCallback(
    async (
      file: File,
      setFieldValue: (field: string, value: string) => void,
      setTouched: (touched: Record<string, boolean>) => void,
    ) => {
      if (!room?.id) return
      setUploading(true)
      try {
        const res = await uploadArtwork(room.id, file)
        if (res.success) {
          setFieldValue("artwork", res.url)
          setTouched({ artwork: true })
        }
      } catch (err) {
        console.error("Failed to upload artwork:", err)
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    },
    [room?.id],
  )

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
        liveIngestEnabled: settings.liveIngestEnabled ?? false,
        liveWhepUrl: settings.liveWhepUrl ?? "",
        liveHlsUrl: settings.liveHlsUrl ?? "",
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
      {({ values, handleChange, handleBlur, handleSubmit, setTouched, setFieldValue, initialValues, dirty }) => (
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
                  <Field.Root>
                    <Checkbox.Root
                      checked={values.liveIngestEnabled}
                      onCheckedChange={(details) => {
                        const checked = !!details.checked
                        setFieldValue("liveIngestEnabled", checked)
                        if (checked !== initialValues.liveIngestEnabled) {
                          setTouched({ liveIngestEnabled: true })
                        } else {
                          setTouched({ liveIngestEnabled: false })
                        }
                      }}
                    >
                      <Checkbox.HiddenInput onBlur={handleBlur} />
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <Checkbox.Label>Experimental WebRTC listen path (MediaMTX)</Checkbox.Label>
                    </Checkbox.Root>
                    <Field.HelperText>
                      Offers Shoutcast + optional WebRTC. Now Playing remains Shoutcast-driven.
                    </Field.HelperText>
                  </Field.Root>
                  {values.liveIngestEnabled && (
                    <>
                      <Field.Root>
                        <Field.Label>WebRTC WHEP URL</Field.Label>
                        <Input
                          name="liveWhepUrl"
                          value={values.liveWhepUrl}
                          onBlur={handleBlur}
                          onChange={(e) => {
                            handleChange(e)
                            if (e.target.value !== initialValues.liveWhepUrl) {
                              setTouched({ liveWhepUrl: true })
                            } else {
                              setTouched({ liveWhepUrl: false })
                            }
                          }}
                        />
                      </Field.Root>
                      <Field.Root>
                        <Field.Label>LL-HLS fallback URL</Field.Label>
                        <Input
                          name="liveHlsUrl"
                          value={values.liveHlsUrl}
                          onBlur={handleBlur}
                          onChange={(e) => {
                            handleChange(e)
                            if (e.target.value !== initialValues.liveHlsUrl) {
                              setTouched({ liveHlsUrl: true })
                            } else {
                              setTouched({ liveHlsUrl: false })
                            }
                          }}
                        />
                      </Field.Root>
                    </>
                  )}
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
                {values.artwork ? (
                  <HStack gap={3} align="start">
                    <Image
                      src={values.artwork}
                      alt="Room artwork"
                      boxSize="80px"
                      objectFit="cover"
                      borderRadius="md"
                    />
                    <VStack align="start" gap={1}>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? <Spinner size="xs" /> : "Replace"}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        onClick={() => {
                          setFieldValue("artwork", "")
                          setTouched({ artwork: true })
                        }}
                      >
                        <Icon as={LuTrash2} />
                        Remove
                      </Button>
                    </VStack>
                  </HStack>
                ) : (
                  <Box>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <Spinner size="xs" />
                      ) : (
                        <Icon as={LuImagePlus} />
                      )}
                      {uploading ? "Uploading…" : "Upload image"}
                    </Button>
                  </Box>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleArtworkUpload(file, setFieldValue, setTouched)
                  }}
                />
                <Field.HelperText>
                  Image to display in the Now Playing area. Leave blank to use album artwork
                  from metadata sources.
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
