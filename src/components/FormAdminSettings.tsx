import React from "react"
import { useMachine } from "@xstate/react"
import { Formik } from "formik"
import { Spinner } from "@chakra-ui/react"
import {
  HStack,
  Button,
  Input,
  Box,
  FormControl,
  FormLabel,
  FormHelperText,
  Textarea,
  Checkbox,
  Text,
  VStack,
  Link,
  Heading,
} from "@chakra-ui/react"
import { CheckIcon, ExternalLinkIcon } from "@chakra-ui/icons"

import { settingsMachine } from "../machines/settingsMachine"
import socket from "../lib/socket"

import Modal from "./Modal"
import { ModalProps } from "@chakra-ui/react"
import { SystemMessage } from "../types/SystemMessage"

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
          socket.on("event", (message: SystemMessage) => {
            if (message.type === "SETTINGS") {
              resolve(message.data?.settings)
            }
          })
          socket.emit("get settings")
        })
      },
      watchForUpdate: () => {
        return new Promise((resolve) => {
          socket.on("event", (message: SystemMessage) => {
            if (message.type === "SETTINGS") {
              resolve(message.data?.settings)
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
        <Box width="100%">
          <Spinner />
        </Box>
      )}
      {state.matches("failed") && (
        <Box>
          <Heading as="h4">Oops</Heading>
          <Text color="red.700">Sorry, this isn't working right now :/</Text>
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
                          <CheckIcon color="green.500" />
                        )
                      }
                      onClick={() => handleSubmit()}
                    >
                      Submit
                    </Button>
                  </HStack>
                }
              >
                <VStack spacing={6}>
                  <FormControl>
                    <FormLabel>Any additional info/links</FormLabel>
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
                    <Checkbox
                      disabled={state.matches("pending")}
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
                      name="fetchMeta"
                    >
                      Fetch album metadata
                    </Checkbox>
                    <FormHelperText>
                      Album Metadata (cover image, release date, info URL) is
                      automatically fetched from{" "}
                      <Link
                        isExternal
                        target="_blank"
                        href="http://musicbrainz.org"
                      >
                        MusicBrainz
                        <ExternalLinkIcon mx="2px" />
                      </Link>{" "}
                      based on the Title/Artist/Album that your broadcast
                      software sends to the Shoustcast server. If you're getting
                      inaccurate data or want to manually set the cover artwork,
                      disable this option.
                    </FormHelperText>
                  </FormControl>

                  <FormControl gap={2}>
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
                    <FormHelperText>
                      Setting a password will prevent people from using this
                      interface to listen to the radio stream. It also prevents
                      them from using or viewing the chat. Clearing this
                      password will open the experience up to anyone.
                    </FormHelperText>
                  </FormControl>
                </VStack>
              </Modal>
            </form>
          )}
        </Formik>
      )}
    </>
  )
}

export default FormAdminSettings
