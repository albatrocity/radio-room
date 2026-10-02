import type React from "react"
import { Text } from "@chakra-ui/react"
import { usePluginConfigs } from "../../../hooks/useActors"
import { usePluginSchemas } from "../../../hooks/usePluginSchemas"
import { PluginComponentProvider } from "../../PluginComponents/PluginComponentRenderer"
import { TEMPLATE_COMPONENT_MAP } from "../../PluginComponents/templates"
import type { GameStatePluginDetailFrame } from "../../../types/GameStateDetail"

/** Renders a plugin detail view (template component) inside that plugin's component context. */
export default function PluginDetailFrame({ frame }: { frame: GameStatePluginDetailFrame }) {
  const { schemas } = usePluginSchemas()
  const pluginConfigs = usePluginConfigs() || {}
  const schema = schemas.find((s) => s.name === frame.pluginName)
  const View = TEMPLATE_COMPONENT_MAP[frame.view] as
    | React.ComponentType<Record<string, string>>
    | undefined

  if (!schema || !View) {
    return (
      <Text fontSize="sm" color="fg.muted">
        This view isn't available.
      </Text>
    )
  }

  return (
    <PluginComponentProvider
      pluginName={frame.pluginName}
      storeKeys={schema.componentSchema?.storeKeys ?? []}
      config={pluginConfigs[frame.pluginName] || schema.defaultConfig || {}}
    >
      <View {...(frame.params ?? {})} />
    </PluginComponentProvider>
  )
}
