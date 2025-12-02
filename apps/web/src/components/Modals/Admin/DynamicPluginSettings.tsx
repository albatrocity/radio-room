import React, { useMemo } from "react"
import { Formik } from "formik"
import { ModalBody, ModalFooter, Text, Spinner, Center, VStack } from "@chakra-ui/react"
import { useSettingsStore } from "../../../state/settingsStore"
import { useAdminStore } from "../../../state/adminStore"
import { useModalsStore } from "../../../state/modalsState"
import { usePluginSchemas } from "../../../hooks/usePluginSchemas"
import PluginConfigForm from "./PluginConfigForm"
import FormActions from "./FormActions"

interface DynamicPluginSettingsProps {
  readonly pluginName: string
}

/**
 * Dynamic plugin settings form that renders based on the plugin's schema.
 * Fetches the schema from the server and uses PluginConfigForm to render.
 */
export default function DynamicPluginSettings({ pluginName }: DynamicPluginSettingsProps) {
  const { state } = useSettingsStore()
  const { send: modalSend } = useModalsStore()
  const { send } = useAdminStore()
  const { schemas, isLoading, error } = usePluginSchemas()

  // Find the schema for this plugin
  const pluginSchema = useMemo(() => {
    return schemas.find((s) => s.name === pluginName)
  }, [schemas, pluginName])

  // Get current config from settings state
  // The settingsMachine stores plugin configs in pluginConfigs keyed by plugin name
  const currentConfig = useMemo(() => {
    // Get from pluginConfigs using the plugin name
    const pluginConfig = state.context.pluginConfigs?.[pluginName]

    // Fall back to defaults if no config stored
    return pluginConfig || pluginSchema?.defaultConfig
  }, [state.context.pluginConfigs, pluginName, pluginSchema])

  // Show loading state
  if (isLoading) {
    return (
      <ModalBody>
        <Center py={8}>
          <VStack spacing={4}>
            <Spinner />
            <Text>Loading plugin settings...</Text>
          </VStack>
        </Center>
      </ModalBody>
    )
  }

  // Show error state
  if (error) {
    return (
      <ModalBody>
        <Text color="red.500">Error loading plugin settings: {error.message}</Text>
      </ModalBody>
    )
  }

  // Show not found state
  if (!pluginSchema) {
    return (
      <ModalBody>
        <Text>Plugin "{pluginName}" not found.</Text>
      </ModalBody>
    )
  }

  // Show no schema state
  if (!pluginSchema.configSchema) {
    return (
      <ModalBody>
        <Text>This plugin does not have a configuration schema.</Text>
      </ModalBody>
    )
  }

  // Build initial values from default config merged with current config
  const initialValues: Record<string, unknown> = {
    ...pluginSchema.defaultConfig,
    ...currentConfig,
  }

  return (
    <Formik
      initialValues={initialValues}
      enableReinitialize
      onSubmit={(values) => {
        send({
          type: "SET_SETTINGS",
          data: {
            pluginConfigs: {
              [pluginName]: values,
            },
          },
        } as any)
      }}
    >
      {({ values, setFieldValue, handleSubmit, dirty }) => (
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <PluginConfigForm
              schema={pluginSchema.configSchema!}
              values={values}
              onChange={(field, value) => setFieldValue(field, value)}
            />
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
