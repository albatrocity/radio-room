import React from "react"
import { Formik } from "formik"
import { Box, Button, TextInput, Heading, Paragraph } from "grommet"

const FormUsername = ({ onClose, onSubmit, currentUser }) => {
  const { username, userId } = currentUser
  return (
    <Box pad="medium" gap="small" width="medium">
      <Formik
        initialValues={{ username: "", userId }}
        onSubmit={(values, { setSubmitting, resetForm }) => {
          if (!values.username || values.username === "") {
            return onClose()
          }
          setSubmitting(false)
          onSubmit(values.username)
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
        }) => (
          <form onSubmit={handleSubmit}>
            <Paragraph>What are we gonna call you in here?</Paragraph>
            <Box direction="row" fill="horizontal">
              <TextInput
                onChange={handleChange}
                onBlur={handleBlur}
                resize={false}
                value={values.username}
                placeholder={username}
                name="username"
                flex="grow"
                autoFocus={true}
                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              />
              <Button
                label="Submit"
                type="submit"
                primary
                disabled={isSubmitting || !isValid}
                style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
              />
            </Box>
          </form>
        )}
      </Formik>
      <Button label={"Cancel"} onClick={() => onClose()} />
    </Box>
  )
}

export default FormUsername
