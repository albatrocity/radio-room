import React, { useMemo } from "react"
import { Formik } from "formik"
import { DialogBody, DialogFooter, Text, Spinner, Center, VStack } from "@chakra-ui/react"
import { useModalsSend, useSettings, useAdminSend } from "../../../hooks/useActors"
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
  const settings = useSettings()
  const modalSend = useModalsSend()
  const send = useAdminSend()
  const { schemas, isLoading, error } = usePluginSchemas()

  // Find the schema for this plugin
  const pluginSchema = useMemo(() => {
    return schemas.find((s) => s.name === pluginName)
  }, [schemas, pluginName])

  // Get current config from settings state
  // The settingsMachine stores plugin configs in pluginConfigs keyed by plugin name
  const currentConfig = useMemo(() => {
    // Get from pluginConfigs using the plugin name
    const pluginConfig = settings.pluginConfigs?.[pluginName]

    // Fall back to defaults if no config stored
    return pluginConfig || pluginSchema?.defaultConfig
  }, [settings.pluginConfigs, pluginName, pluginSchema])

  // Show loading state
  if (isLoading) {
    return (
      <DialogBody>
        <Center py={8}>
          <VStack gap={4}>
            <Spinner />
            <Text>Loading plugin settings...</Text>
          </VStack>
        </Center>
      </DialogBody>
    )
  }

  // Show error state
  if (error) {
    return (
      <DialogBody>
        <Text color="red.500">Error loading plugin settings: {error.message}</Text>
      </DialogBody>
    )
  }

  // Show not found state
  if (!pluginSchema) {
    return (
      <DialogBody>
        <Text>Plugin "{pluginName}" not found.</Text>
      </DialogBody>
    )
  }

  // Show no schema state
  if (!pluginSchema.configSchema) {
    return (
      <DialogBody>
        <Text>This plugin does not have a configuration schema.</Text>
      </DialogBody>
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
          <DialogBody>
            <PluginConfigForm
              schema={pluginSchema.configSchema!}
              values={values}
              onChange={(field, value) => setFieldValue(field, value)}
              pluginName={pluginName}
            />
          </DialogBody>
          <DialogFooter>
            <FormActions
              onCancel={() => modalSend({ type: "CLOSE" })}
              onSubmit={handleSubmit}
              dirty={dirty}
            />
          </DialogFooter>
        </form>
      )}
    </Formik>
  )
}
