import React from "react"
import { Formik } from "formik"
import { Button, Text, Stack, Input, HStack } from "@chakra-ui/react"
import { User } from "../types/User"
import Modal from "./Modal"
import { ModalProps } from "@chakra-ui/react"

interface Props extends Pick<ModalProps, "isOpen"> {
  onClose: () => void
  onSubmit: (username?: string) => void
  currentUser: User
}

const FormUsername = ({ onClose, onSubmit, currentUser, isOpen }: Props) => {
  const { username, userId } = currentUser
  return (
    <Formik
      initialValues={{ username: "", userId }}
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
                // colorScheme="primary"
                disabled={isSubmitting || !isValid}
                onClick={() => handleSubmit()}
              >
                Submit
              </Button>
            </HStack>
          }
        >
          <Stack spacing={2}>
            <form onSubmit={handleSubmit}>
              <Text as="label" mb={2}>
                What are we gonna call you in here?
              </Text>
              <Input
                size="md"
                onChange={handleChange}
                onBlur={handleBlur}
                p={2}
                value={values.username}
                placeholder={username}
                name="username"
                flex="grow"
                autoFocus={true}
                style={{
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                }}
              />
            </form>
            <Text color="blackAlpha.400" fontSize="xs">
              None of the data used in this app is permanently stored or shared
              with any other service. This is a fun-making operation only.
            </Text>
          </Stack>
        </Modal>
      )}
    </Formik>
  )
}

export default FormUsername
