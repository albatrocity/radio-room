import React from "react"
import { Formik } from "formik"
import { Box, Button, Text, Input } from "@chakra-ui/react"
import { ModalProps } from "@chakra-ui/react"

import Modal from "./Modal"

interface Props extends Pick<ModalProps, "isOpen" | "onClose"> {
  onSubmit: (password?: string) => void
  error?: string
}

const FormPassword = ({ onSubmit, isOpen, onClose, error }: Props) => {
  return (
    <Box pad="medium" gap="medium" width="medium">
      <Formik
        initialValues={{ password: "" }}
        onSubmit={(values, { setSubmitting }) => {
          setSubmitting(false)
          onSubmit(values.password)
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
            onClose={onClose}
            isOpen={isOpen}
            canClose={false}
            heading="Password required"
            footer={
              <Button
                type="submit"
                disabled={isSubmitting || !isValid}
                onClick={() => handleSubmit()}
              >
                Submit
              </Button>
            }
          >
            <form onSubmit={handleSubmit}>
              <Text as="label" mb={2}>
                Please enter the password for this party!
              </Text>
              <Input
                size="medium"
                onChange={handleChange}
                onBlur={handleBlur}
                value={values.password}
                name="password"
                type="password"
                flex="grow"
                autoFocus={true}
                style={{
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                }}
              />
              {error && (
                <Text fontSize="sm" color="red">
                  {error}
                </Text>
              )}
            </form>
          </Modal>
        )}
      </Formik>
    </Box>
  )
}

export default FormPassword
