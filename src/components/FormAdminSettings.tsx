import React from "react"
import { useMachine } from "@xstate/react"
import { Formik } from "formik"
import Spinner from "./Spinner"
import { HStack, Button, Input } from "@chakra-ui/react"
import {
  Form,
  Box,
  CheckBox,
  FormField,
  Text,
  Anchor,
  Heading,
  TextArea,
} from "grommet"
import { Validate } from "grommet-icons"

import { settingsMachine } from "../machines/settingsMachine"
import socket from "../lib/socket"

import Modal from "./Modal"
import { ModalProps } from "@chakra-ui/react"

interface FormValues {
  fetchMeta: boolean
  donationURL: string
  extraInfo?: string
  password?: string
}

interface Props extends Pick<ModalProps, "isOpen" | "onClose"> {
  onSubmit: (values: FormValues) => void
}

const FormAdminSettings = ({ onSubmit, isOpen, onClose }: Props) => {
  const [state, send] = useMachine(settingsMachine, {
    services: {
      fetchSettings: () => {
        return new Promise((resolve) => {
          socket.on("event", (message) => {
            if (message.type === "SETTINGS") {
              resolve(message.data.settings)
            }
          })
          socket.emit("get settings")
        })
      },
      watchForUpdate: () => {
        return new Promise((resolve) => {
          socket.on("event", (message) => {
            if (message.type === "SETTINGS") {
              resolve(message.data.settings)
            }
          })
        })
      },
    },
    actions: {
      flashSuccess: () => {},
    },
  })

  return (
    <>
      {state.matches("pending") && (
        <Box fill>
          <Spinner />
        </Box>
      )}
      {state.matches("failed") && (
        <Box>
          <Heading level={4} margin="none">
            Oops
          </Heading>
          <Text color="status-error">
            Sorry, this isn't working right now :/
          </Text>
        </Box>
      )}
      {state.matches("fetched") && (
        <Formik
          initialValues={{
            fetchMeta: state.context.fetchMeta,
            donationURL: state.context.donationURL,
            extraInfo: state.context.extraInfo,
            password: state.context.password || "",
          }}
          validate={() => {
            const errors = {}
            return errors
          }}
          onSubmit={(values, { setSubmitting }) => {
            send("SUBMIT")
            setSubmitting(false)
            onSubmit(values)
          }}
        >
          {({
            values,
            handleChange,
            handleBlur,
            handleSubmit,
            setTouched,
            initialValues,
          }) => (
            <form onSubmit={handleSubmit}>
              <Modal
                isOpen={isOpen}
                onClose={onClose}
                heading="Settings"
                footer={
                  <HStack spacing={2}>
                    <Button variant="outline" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={!state.matches("fetched.untouched")}
                      rightIcon={
                        state.matches("fetched.successful") && (
                          <Validate size="medium" color="status-ok" />
                        )
                      }
                      onClick={() => handleSubmit()}
                    >
                      Submit
                    </Button>
                  </HStack>
                }
              >
                <Box gap="small">
                  <TextArea
                    onChange={(e) => {
                      handleChange(e)
                      if (e.target.value !== initialValues.extraInfo) {
                        setTouched({ extraInfo: true })
                      } else {
                        setTouched({ extraInfo: false })
                      }
                    }}
                    onBlur={handleBlur}
                    value={values.extraInfo}
                    placeholder="Any additional info/links"
                    name="extraInfo"
                  />
                  <FormField
                    disabled={state.matches("pending")}
                    info={
                      <Text size="small" color="text-xweak">
                        Album Metadata (cover image, release date, info URL) is
                        automatically fetched from{" "}
                        <Anchor target="_blank" href="http://musicbrainz.org">
                          MusicBrainz
                        </Anchor>{" "}
                        based on the Title/Artist/Album that your broadcast
                        software sends to the Shoustcast server. If you're
                        getting inaccurate data or want to manually set the
                        cover artwork, disable this option.
                      </Text>
                    }
                  >
                    <CheckBox
                      checked={values.fetchMeta}
                      onChange={(e) => {
                        handleChange(e)
                        if (e.target.checked !== initialValues.fetchMeta) {
                          setTouched({ fetchMeta: true })
                        } else {
                          setTouched({ fetchMeta: false })
                        }
                      }}
                      onBlur={handleBlur}
                      value={values.fetchMeta}
                      label="Fetch album metadata"
                      name="fetchMeta"
                    />
                  </FormField>

                  <FormField
                    disabled={state.matches("pending")}
                    info={
                      <Text size="small" color="text-xweak">
                        Setting a password will prevent people from using this
                        interface to listen to the radio stream. It also
                        prevents them from using or viewing the chat. Clearing
                        this password will open the experience up to anyone.
                      </Text>
                    }
                  >
                    <Input
                      disabled={state.matches("pending")}
                      onChange={(e) => {
                        handleChange(e)
                      }}
                      onBlur={handleBlur}
                      value={values.password}
                      name="password"
                      placeholder="Password"
                    />
                  </FormField>
                </Box>
              </Modal>
            </form>
          )}
        </Formik>
      )}
    </>
  )
}

export default FormAdminSettings
