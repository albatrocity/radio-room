import { Request, Response } from "express"

/**
 * Get all registered plugin schemas.
 * Used by the frontend to dynamically generate plugin configuration forms.
 */
export async function getPluginSchemas(req: Request, res: Response) {
  const { context } = req
  const { pluginRegistry } = context

  if (!pluginRegistry) {
    return res.status(500).json({ error: "Plugin registry not available" })
  }

  const plugins = pluginRegistry.getPluginSchemas()
  res.json({ plugins })
}

/**
 * Get schema for a specific plugin.
 * Returns 404 if the plugin is not registered.
 */
export async function getPluginSchema(req: Request, res: Response) {
  const { pluginName } = req.params
  const { context } = req
  const { pluginRegistry } = context

  if (!pluginRegistry) {
    return res.status(500).json({ error: "Plugin registry not available" })
  }

  const schema = pluginRegistry.getPluginSchema(pluginName)
  if (!schema) {
    return res.status(404).json({ error: `Plugin ${pluginName} not found` })
  }

  res.json(schema)
}
