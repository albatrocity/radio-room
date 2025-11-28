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

/**
 * Get component state for all plugins in a room.
 * Used to hydrate component stores when users join.
 */
export async function getPluginComponentStates(req: Request, res: Response) {
  const { roomId } = req.params
  const { context } = req
  const { pluginRegistry } = context

  if (!pluginRegistry) {
    return res.status(500).json({ error: "Plugin registry not available" })
  }

  if (!roomId) {
    return res.status(400).json({ error: "Room ID is required" })
  }

  const states = await pluginRegistry.getAllPluginComponentStates(roomId)
  res.json({ states })
}

/**
 * Get component state for a specific plugin in a room.
 */
export async function getPluginComponentState(req: Request, res: Response) {
  const { roomId, pluginName } = req.params
  const { context } = req
  const { pluginRegistry } = context

  if (!pluginRegistry) {
    return res.status(500).json({ error: "Plugin registry not available" })
  }

  if (!roomId || !pluginName) {
    return res.status(400).json({ error: "Room ID and plugin name are required" })
  }

  const state = await pluginRegistry.getPluginComponentState(roomId, pluginName)
  if (state === null) {
    return res.status(404).json({ error: `Plugin ${pluginName} not found in room ${roomId}` })
  }

  res.json({ state })
}
