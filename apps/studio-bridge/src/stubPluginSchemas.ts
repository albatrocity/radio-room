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
  {
    name: "quiz-sessions",
    version: "0.0.0-bridge",
    description: "Quiz sessions (bridge preview stub — use production API for admin schema).",
    defaultConfig: {
      enabled: true,
    },
    componentSchema: {
      components: [
        {
          id: "quiz-question-card",
          type: "quiz-question-card",
          area: "aboveChat",
          showWhen: { field: "enabled", value: true },
        },
        {
          id: "quiz-tab",
          type: "tab",
          area: "gameStateTab",
          label: "Quiz",
          icon: "Brain",
          showWhen: { field: "enabled", value: true },
          children: [
            {
              id: "quiz-leaderboard",
              type: "leaderboard",
              area: "gameStateTab",
              dataKey: "leaderboard",
              title: "Quiz standings",
              rowTemplate: "{{username}} — {{score}} correct",
              maxItems: 25,
              showRank: true,
            },
          ],
        },
      ],
      storeKeys: ["activeQuestion", "leaderboard", "lastCorrectAnswer"],
    },
  },
  {
    name: "volume-manager",
    version: "0.0.0-bridge",
    description: "Volume Manager (bridge preview stub — use production API for admin schema).",
    defaultConfig: {
      enabled: true,
      volume: 100,
      setOnTrackStart: false,
      startVolume: 100,
    },
    componentSchema: {
      components: [
        {
          id: "volume-slider",
          type: "slider",
          area: "nowPlayingInfo",
          dataKey: "volume",
          icon: "Volume2",
          min: 0,
          max: 100,
          step: 1,
          action: "setVolume",
          adminOnly: true,
          showWhen: { field: "enabled", value: true },
        },
      ],
      storeKeys: ["volume"],
    },
  },
]
