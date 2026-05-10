/**
 * Minimal `GET /api/plugins` entries so the Room UI can resolve plugin game-state tabs
 * (full admin schemas live on the real API). Kept in sync with `plugin-item-shops` tab ids.
 */
export const bridgePluginSchemasForApi = [
  {
    name: "item-shops",
    version: "0.0.0-bridge",
    description: "Item shops (bridge preview stub — use production API for admin schema).",
    defaultConfig: {
      enabled: true,
      enabledShopIds: [] as string[],
      assignShopOnJoin: true,
    },
    componentSchema: {
      components: [
        {
          id: "item-shops-tab",
          type: "tab",
          area: "gameStateTab",
          label: "Item Shop",
          icon: "ShoppingCart",
          showWhen: { field: "enabled", value: true },
          children: [
            {
              id: "item-shops-offers",
              type: "current-shop-offers",
              area: "gameStateTab",
            },
          ],
        },
      ],
    },
  },
]
