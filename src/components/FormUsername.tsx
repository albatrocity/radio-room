import React, { memo } from "react"
import { Formik } from "formik"
import {
  Button,
  Stack,
  Input,
  HStack,
  FormControl,
  FormLabel,
  FormHelperText,
} from "@chakra-ui/react"
import { User } from "../types/User"
import Modal from "./Modal"
import { ModalProps } from "@chakra-ui/react"
import ButtonAuthSpotify from "./ButtonAuthSpotify"
import { useCurrentRoom } from "../state/roomStore"

interface Props extends Pick<ModalProps, "isOpen"> {
  onClose: () => void
  onSubmit: (username?: string) => void
  currentUser: User
}

const FormUsername = ({ onClose, onSubmit, currentUser, isOpen }: Props) => {
  const room = useCurrentRoom()
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
          isOpen={isOpen}
          onClose={onClose}
          heading="Your Name"
          footer={
            <HStack spacing={2}>
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
            <Stack spacing={10}>
              <FormControl>
                <FormLabel>What are we gonna call you in here?</FormLabel>
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
                <FormHelperText>
                  None of the data used in this app is permanently stored or
                  shared with any other service. This is a fun-making operation
                  only.
                </FormHelperText>
              </FormControl>
              {room?.enableSpotifyLogin && (
                <FormControl>
                  <ButtonAuthSpotify />

                  <FormHelperText>
                    Authorizing this app with your Spotify account will allow
                    you to create playlists from the track history.
                  </FormHelperText>
                </FormControl>
              )}
            </Stack>
          </form>
        </Modal>
      )}
    </Formik>
  )
}

export default memo(FormUsername)
