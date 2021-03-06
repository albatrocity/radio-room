import React from "react"
import { Formik } from "formik"
import { Box, Button, Text, TextInput, Heading, Paragraph } from "grommet"

const FormPassword = ({ onClose, onSubmit, error }) => {
  return (
    <Box pad="medium" gap="medium" width="medium">
      <Formik
        initialValues={{ password: "" }}
        onSubmit={(values, { setSubmitting, resetForm }) => {
          setSubmitting(false)
          onSubmit(values.password)
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
            <Paragraph>Please enter the password for this party!</Paragraph>
            {error && <Text color="status-critical">{error}</Text>}
            <Box direction="row" fill="horizontal">
              <TextInput
                size="medium"
                onChange={handleChange}
                onBlur={handleBlur}
                resize={false}
                value={values.password}
                name="password"
                type="password"
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
    </Box>
  )
}

export default FormPassword
