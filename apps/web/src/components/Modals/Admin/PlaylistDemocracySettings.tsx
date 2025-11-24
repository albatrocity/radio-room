import { Formik } from "formik"
import React from "react"
import {
  Box,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  ModalBody,
  ModalFooter,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Radio,
  RadioGroup,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import { settingsMachine } from "../../../machines/settingsMachine"
import { useMachine } from "@xstate/react"
import { useAdminStore } from "../../../state/adminStore"
import { useModalsStore } from "../../../state/modalsState"
import FormActions from "./FormActions"

export default function PlaylistDemocracySettings() {
  const [state] = useMachine(settingsMachine)
  const { send: modalSend } = useModalsStore()
  const { send } = useAdminStore()

  const initialConfig = state.context.playlistDemocracy

  // Wait for settings to load before rendering form
  if (state.matches("pending")) {
    return (
      <ModalBody>
        <Text>Loading settings...</Text>
      </ModalBody>
    )
  }

  return (
    <Formik
      initialValues={{
        enabled: initialConfig.enabled,
        reactionType: initialConfig.reactionType,
        timeLimit: initialConfig.timeLimit,
        thresholdType: initialConfig.thresholdType,
        thresholdValue: initialConfig.thresholdValue,
      }}
      enableReinitialize
      validate={() => {
        const errors = {}
        return errors
      }}
      onSubmit={(values) => {
        send({
          type: "SET_SETTINGS",
          data: {
            pluginConfigs: {
              "playlist-democracy": values,
            },
          },
        } as any)
      }}
    >
      {({
        values,
        handleChange,
        handleBlur,
        handleSubmit,
        setFieldValue,
        setTouched,
        initialValues,
        dirty,
      }) => (
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <VStack spacing={6}>
              <Box>
                <Text fontSize="lg" fontWeight="bold" mb={2}>
                  🗳️ Playlist Democracy
                </Text>
                <Text fontSize="sm" color="gray.600">
                  Automatically skip tracks that don't receive enough reactions from listeners
                </Text>
              </Box>

              <FormControl>
                <Checkbox
                  isChecked={values.enabled}
                  onChange={(e) => {
                    handleChange(e)
                    if (e.target.checked !== initialValues.enabled) {
                      setTouched({ enabled: true })
                    } else {
                      setTouched({ enabled: false })
                    }
                  }}
                  onBlur={handleBlur}
                  name="enabled"
                >
                  Enable Playlist Democracy
                </Checkbox>
                <FormHelperText>
                  When enabled, tracks will be automatically skipped if they don't meet the reaction
                  threshold
                </FormHelperText>
              </FormControl>

              {values.enabled && (
                <>
                  <FormControl>
                    <FormLabel>Reaction Type</FormLabel>
                    <Input
                      name="reactionType"
                      value={values.reactionType}
                      onChange={(e) => {
                        handleChange(e)
                        if (e.target.value !== initialValues.reactionType) {
                          setTouched({ reactionType: true })
                        } else {
                          setTouched({ reactionType: false })
                        }
                      }}
                      onBlur={handleBlur}
                      placeholder="thumbsdown"
                    />
                    <FormHelperText>
                      Emoji shortcode to count (e.g., "+1", "-1", "fire")
                    </FormHelperText>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Time Limit (seconds)</FormLabel>
                    <NumberInput
                      value={values.timeLimit / 1000}
                      onChange={(valueString) => {
                        const value = parseInt(valueString) || 60
                        const timeLimit = value * 1000
                        setFieldValue("timeLimit", timeLimit)
                        if (timeLimit !== initialValues.timeLimit) {
                          setTouched({ timeLimit: true })
                        } else {
                          setTouched({ timeLimit: false })
                        }
                      }}
                      min={10}
                      max={300}
                    >
                      <NumberInputField />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                    <FormHelperText>
                      How long to wait before checking the threshold (10-300 seconds)
                    </FormHelperText>
                  </FormControl>

                  <FormControl>
                    <FormLabel>Threshold Type</FormLabel>
                    <RadioGroup
                      value={values.thresholdType}
                      onChange={(value) => {
                        setFieldValue("thresholdType", value)
                        if (value !== initialValues.thresholdType) {
                          setTouched({ thresholdType: true })
                        } else {
                          setTouched({ thresholdType: false })
                        }
                      }}
                    >
                      <Stack direction="column" spacing={2}>
                        <Radio value="percentage">Percentage of listeners</Radio>
                        <Radio value="static">Fixed number</Radio>
                      </Stack>
                    </RadioGroup>
                    <FormHelperText>
                      {values.thresholdType === "percentage"
                        ? "Require a percentage of listening users to react"
                        : "Require a fixed number of reactions"}
                    </FormHelperText>
                  </FormControl>

                  <FormControl>
                    <FormLabel>
                      Threshold Value {values.thresholdType === "percentage" ? "(%)" : ""}
                    </FormLabel>
                    <NumberInput
                      value={values.thresholdValue}
                      onChange={(valueString) => {
                        const value = parseInt(valueString) || 1
                        setFieldValue("thresholdValue", value)
                        if (value !== initialValues.thresholdValue) {
                          setTouched({ thresholdValue: true })
                        } else {
                          setTouched({ thresholdValue: false })
                        }
                      }}
                      min={1}
                      max={values.thresholdType === "percentage" ? 100 : 999}
                    >
                      <NumberInputField />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                    <FormHelperText>
                      {values.thresholdType === "percentage"
                        ? "Percentage of listeners needed (1-100%)"
                        : "Number of reactions needed (minimum 1)"}
                    </FormHelperText>
                  </FormControl>

                  <Box bg="blue.50" p={3} borderRadius="md">
                    <Text fontSize="sm">
                      <strong>Example:</strong> With {values.thresholdValue}
                      {values.thresholdType === "percentage" ? "%" : ""} threshold and{" "}
                      {values.timeLimit / 1000} second time limit, a track will be skipped if it
                      doesn't get{" "}
                      {values.thresholdType === "percentage"
                        ? `${values.thresholdValue}% of listeners to`
                        : `at least ${values.thresholdValue}`}{" "}
                      react with :{values.reactionType}: within {values.timeLimit / 1000} seconds.
                    </Text>
                  </Box>
                </>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <FormActions
              onCancel={() => modalSend("CLOSE")}
              onSubmit={handleSubmit}
              dirty={dirty}
            />
          </ModalFooter>
        </form>
      )}
    </Formik>
  )
}
