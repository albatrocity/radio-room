import React from "react"
import { useMachine } from "@xstate/react"
import { Formik } from "formik"
import Spinner from "./Spinner"
import {
  Button,
  Form,
  Box,
  CheckBox,
  FormField,
  Text,
  Anchor,
  Heading,
  TextInput,
  TextArea,
} from "grommet"
import { Validate, Currency } from "grommet-icons"

import { settingsMachine } from "../machines/settingsMachine"
import socket from "../lib/socket"

const FormAdminSettings = ({ onSubmit }) => {
  const [state, send] = useMachine(settingsMachine, {
    services: {
      fetchSettings: () => {
        return new Promise((resolve, reject) => {
          socket.on("settings", settings => {
            resolve(settings)
          })
          socket.emit("get settings")
        })
      },
      watchForUpdate: () => {
        return new Promise((resolve, reject) => {
          socket.on("settings", settings => {
            resolve(settings)
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
          }}
          validate={values => {
            const errors = {}
            return errors
          }}
          onSubmit={(values, { setSubmitting, resetForm }) => {
            send("SUBMIT")
            setSubmitting(false)
            onSubmit(values)
          }}
        >
          {({
            values,
            errors,
            touched,
            handleChange,
            handleBlur,
            handleSubmit,
            isSubmitting,
            isValid,
            setTouched,
            initialValues,
          }) => (
            <Form onSubmit={handleSubmit}>
              <Box gap="small">
                <TextInput
                  checked={values.donationURL}
                  onChange={e => {
                    handleChange(e)
                    if (e.target.value !== initialValues.donationURL) {
                      setTouched({ donationURL: true })
                    } else {
                      setTouched({ donationURL: false })
                    }
                  }}
                  onBlur={handleBlur}
                  value={values.donationURL}
                  label="Donation URL"
                  placeholder="Donation URL"
                  name="donationURL"
                  icon={<Currency />}
                />
                <TextArea
                  checked={values.extraInfo}
                  onChange={e => {
                    handleChange(e)
                    if (e.target.value !== initialValues.extraInfo) {
                      setTouched({ extraInfo: true })
                    } else {
                      setTouched({ extraInfo: false })
                    }
                  }}
                  onBlur={handleBlur}
                  value={values.extraInfo}
                  label="Donation URL"
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
                      software sends to the Shoustcast server. If you're getting
                      inaccurate data or want to manually set the cover artwork,
                      disable this option.
                    </Text>
                  }
                >
                  <CheckBox
                    checked={values.fetchMeta}
                    onChange={e => {
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
                <Box
                  direction="row"
                  align="center"
                  gap="small"
                  justify="stretch"
                  fill="horizontal"
                >
                  <Box flex={{ grow: 1, shrink: 1 }}>
                    <Button
                      type="submit"
                      fill
                      label="Submit"
                      primary
                      width="100%"
                      disabled={!state.matches("fetched.untouched")}
                    />
                  </Box>
                  {state.matches("fetched.successful") && (
                    <Box
                      animation={{
                        type: "zoomOut",
                        size: "xlarge",
                        duration: 300,
                      }}
                      flex={{ shrink: 1 }}
                    >
                      <Validate size="medium" color="status-ok" />
                    </Box>
                  )}
                </Box>
              </Box>
            </Form>
          )}
        </Formik>
      )}
    </>
  )
}

export default FormAdminSettings
