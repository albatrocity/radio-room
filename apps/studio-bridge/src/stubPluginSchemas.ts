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
      storeKeys: ["activeQuestion", "leaderboard", "lastCorrectAnswer", "autoAdvanceDeadline"],
    },
  },
  {
    name: "playlist-bingo",
    version: "0.0.0-bridge",
    description: "Playlist Bingo (bridge preview stub — use production API for admin schema).",
    defaultConfig: {
      enabled: true,
      category: "releaseYear",
    },
    componentSchema: {
      components: [
        {
          id: "bingo-tab",
          type: "tab",
          area: "gameStateTab",
          label: "Bingo",
          icon: "Trophy",
          showWhen: { field: "enabled", value: true },
          children: [
            {
              id: "bingo-card",
              type: "bingo-card",
              area: "gameStateTab",
              showWhen: { field: "enabled", value: true },
            },
          ],
        },
      ],
      storeKeys: ["roundActive", "category", "statusMessage"],
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
      components: [],
      storeKeys: ["volume"],
    },
  },
  {
    name: "round-robin-dj",
    version: "0.0.0-bridge",
    description: "Round Robin DJ (bridge preview stub — use production API for admin schema).",
    defaultConfig: {
      enabled: true,
      mode: "sequential",
      autoAdvanceRounds: true,
      deferOutOfTurnQueues: true,
    },
    componentSchema: {
      components: [
        {
          id: "rr-your-turn",
          type: "text-block",
          area: "addToQueue",
          status: "success",
          alertVariant: "subtle",
          size: "sm",
          fontWeight: "semibold",
          content: "It's your turn to add a track to the queue",
          showWhen: [
            { field: "enabled", value: true },
            { field: "eligibleUserIds", includes: "viewer.userId" },
          ],
        },
        {
          id: "rr-hold-next-round",
          type: "text-block",
          area: "addToQueue",
          status: "info",
          alertVariant: "subtle",
          size: "sm",
          fontWeight: "medium",
          content:
            "You've already added a track for this round, but you can select one for the next round.",
          showWhen: [
            { field: "enabled", value: true },
            { field: "holdForNextRoundUserIds", includes: "viewer.userId" },
          ],
        },
        {
          id: "rr-other-turn",
          type: "text-block",
          area: "addToQueue",
          status: "warning",
          alertVariant: "subtle",
          size: "sm",
          fontWeight: "medium",
          content: [
            { type: "text", content: "It's " },
            {
              type: "component",
              name: "username",
              props: { userId: "{{currentTurnUserId}}" },
            },
            { type: "text", content: "'s turn" },
          ],
          showWhen: [
            { field: "enabled", value: true },
            { field: "hasSingleTurn", value: true },
            { field: "participantUserIds", includes: "viewer.userId" },
            { field: "eligibleUserIds", notIncludes: "viewer.userId" },
            { field: "holdForNextRoundUserIds", notIncludes: "viewer.userId" },
          ],
        },
      ],
      storeKeys: [
        "eligibleUserIds",
        "holdForNextRoundUserIds",
        "currentTurnUserId",
        "hasSingleTurn",
        "participantUserIds",
      ],
    },
  },
]
