import React, { memo } from "react"
import { Formik } from "formik"
import {
  Button,
  Stack,
  Input,
  HStack,
  Field,
} from "@chakra-ui/react"
import { User } from "../types/User"
import Modal from "./Modal"
import ButtonAuthSpotify from "./ButtonAuthSpotify"
import { useCurrentRoom } from "../state/roomStore"

interface Props {
  onClose: () => void
  onSubmit: (username?: string) => void
  currentUser: User
  open?: boolean
  isOpen?: boolean
}

const FormUsername = ({ onClose, onSubmit, currentUser, open, isOpen }: Props) => {
  const room = useCurrentRoom()
  // Support both legacy isOpen and new open prop
  const isDialogOpen = open ?? isOpen ?? false

  return (
    <Formik
      initialValues={{ username: "", userId: currentUser?.userId }}
      onSubmit={(values, { setSubmitting }) => {
        if (!values.username || values.username === "") {
          return onClose()
        }
        setSubmitting(false)
        onSubmit(values.username || currentUser.username)
      }}
    >
      {({
        values,
        handleChange,
        handleBlur,
        handleSubmit,
        isSubmitting,
        isValid,
      }) => (
        <Modal
          open={isDialogOpen}
          onClose={onClose}
          heading="Your Name"
          footer={
            <HStack gap={2}>
              <Button variant="outline" onClick={() => onClose()}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !isValid}
                onClick={() => handleSubmit()}
              >
                Submit
              </Button>
            </HStack>
          }
        >
          <form onSubmit={handleSubmit}>
            <Stack gap={10}>
              <Field.Root>
                <Field.Label>What are we gonna call you in here?</Field.Label>
                <Input
                  size="md"
                  onChange={handleChange}
                  onBlur={handleBlur}
                  p={2}
                  value={values.username}
                  placeholder={currentUser?.username}
                  name="username"
                  flex="grow"
                  autoFocus={true}
                  style={{
                    borderTopRightRadius: 0,
                    borderBottomRightRadius: 0,
                  }}
                />
                <Field.HelperText>
                  You can change this later by clicking the edit icon next to
                  your name in the listeners list.
                </Field.HelperText>
              </Field.Root>
              {room?.enableSpotifyLogin && (
                <Field.Root>
                  <ButtonAuthSpotify />

                  <Field.HelperText>
                    Authorizing this app with your Spotify account will allow
                    you to create playlists from the track history.
                  </Field.HelperText>
                </Field.Root>
              )}
            </Stack>
          </form>
        </Modal>
      )}
    </Formik>
  )
}

export default memo(FormUsername)
