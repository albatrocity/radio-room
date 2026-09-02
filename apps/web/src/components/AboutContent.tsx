import type { ReactNode } from "react"
import { Accordion, HStack, Span, Text, VStack } from "@chakra-ui/react"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import ButtonAddToQueue from "./ButtonAddToQueue"
import ButtonEditUsername from "./ButtonEditUsername"
import ButtonFeedback from "./ButtonFeedback"
import ButtonGameState from "./ButtonGameState"
import ButtonPlaylist from "./ButtonPlaylist"
import PlayPauseButton from "./PlayPauseButton"
import { primeRadioStreamPlayerFromGesture } from "../actors/radioStreamActor"
import {
  useAudioSend,
  useCanAddToQueue,
  useCurrentRoomHasAudio,
  useHasActiveGameSession,
  useIsAudioLoading,
  useIsPlaying,
  useModalsSend,
  usePluginConfigs,
  useUserGameSession,
  useUserInventory,
  useUserItemDefinitions,
} from "../hooks/useActors"

type AboutSection = {
  id: string
  title: string
  body: string
  action?: ReactNode
}

function AboutContent() {
  const modalSend = useModalsSend()
  const audioSend = useAudioSend()
  const playing = useIsPlaying()
  const loading = useIsAudioLoading()
  const hasAudio = useCurrentRoomHasAudio()
  const canAddToQueue = useCanAddToQueue()
  const hasActiveSession = useHasActiveGameSession()
  const session = useUserGameSession()
  const inventory = useUserInventory()
  const itemDefinitions = useUserItemDefinitions()
  const pluginConfigs = usePluginConfigs()

  const coinEnabled = session?.config.enabledAttributes.includes("coin") ?? false
  const inventoryEnabled = session?.config.inventoryEnabled === true
  const allowTrading = session?.config.allowTrading === true
  const itemShopsEnabled = pluginConfigs?.[ITEM_SHOPS_PLUGIN_NAME]?.enabled === true
  const physicalMediaEnabled =
    (inventory?.maxCollectionSlots ?? session?.config.maxCollectionSlots ?? 0) > 0 ||
    itemDefinitions.some((d) => d.slotPool === "collection")

  const sections: AboutSection[] = []

  if (hasAudio) {
    sections.push({
      id: "audio",
      title: "Playing the room audio",
      body: "Use the play button to stream the audio feed. This is a live feed from the Listening Room crew, albeit delayed a few seconds. Keep this in mind when we seem slow to respond to the chat.",
      action: (
        <PlayPauseButton
          playing={playing}
          loading={loading}
          onClick={() => {
            if (!playing) primeRadioStreamPlayerFromGesture()
            audioSend({ type: "TOGGLE" })
          }}
        />
      ),
    })
  }

  sections.push({
    id: "name",
    title: "Changing your name",
    body: "Tap the pencil next to your name in the listeners list (sidebar) to set how you appear in chat and on the room roster.",
    action: <ButtonEditUsername />,
  })

  if (canAddToQueue) {
    sections.push({
      id: "queue",
      title: "Queueing songs",
      body: "You're deputized to add music. Use Add to Queue in the player controls to search and send tracks. Upcoming tracks show in the Playlist drawer under the queue section.",
      action: <ButtonAddToQueue variant="subtle" showCount={false} />,
    })
  } else {
    sections.push({
      id: "queue",
      title: "Queueing songs",
      body: "When a host deputizes you, an Add to Queue control appears in the player. Use it to search and send tracks; upcoming picks show in the Playlist drawer.",
    })
  }

  sections.push({
    id: "playlist",
    title: "Viewing the playlist",
    body: "Open the playlist near the player to see what has already played tonight, plus the upcoming queue when it's visible.",
    action: <ButtonPlaylist />,
  })

  sections.push({
    id: "chat",
    title: "Chat",
    body: "The public chat is where the action is. Behave yourself. Mention someone with @ to get their attention.",
  })

  if (hasActiveSession) {
    const sessionLabel = session?.config.name?.trim() ? ` (${session.config.name.trim()})` : ""
    const coinBit = coinEnabled
      ? " Earn points and coins from minigames and contests. Your totals show on the Game button and inside Game State. You'll also find your inventory in here, as well as other gamey tidbits."
      : " Open Game State from the game controller button to game-related stuff."
    sections.push({
      id: "game",
      title: "Game sessions",
      body: `A game session is running! ${coinBit}`,
      action: <ButtonGameState />,
    })
  }

  if (hasActiveSession && (inventoryEnabled || itemShopsEnabled)) {
    sections.push({
      id: "items",
      title: "Items & shops",
      body: itemShopsEnabled
        ? "Open Game State for your inventory and any shop tabs. Items can do something when you use them, or apply an effect while you hold them."
        : "Open Game State → Inventory to see items you've picked up. Items can do something when you use them, or apply an effect while you hold them.",
      action: <ButtonGameState />,
    })
  }

  if (hasActiveSession && allowTrading) {
    sections.push({
      id: "gifts",
      title: "Gifting & trading",
      body: "From an inventory item you can gift it to another listener or open a two-party trade. Pending gifts and trades appear under Game State → Trades/Gifts.",
      action: <ButtonGameState />,
    })
  }

  if (hasActiveSession && physicalMediaEnabled) {
    sections.push({
      id: "physical-media",
      title: "Physical Media",
      body: "Physical Media items grant access to special recordings from the Listening Room library. They live in your collection (in Game State area: click the game controller icon) and allow queueing songs held on them.",
      action: <ButtonGameState />,
    })
  }

  return (
    <VStack align="stretch" gap={4} py={1}>
      <Text fontSize="sm" color="fg.muted">
        Quick tour of what's available in this Listening Room show.
      </Text>

      <Accordion.Root collapsible multiple defaultValue={sections.slice(0, 2).map((s) => s.id)}>
        {sections.map((section) => (
          <Accordion.Item key={section.id} value={section.id}>
            <Accordion.ItemTrigger>
              <Span flex="1" fontWeight="semibold" textAlign="start">
                {section.title}
              </Span>
              <Accordion.ItemIndicator />
            </Accordion.ItemTrigger>
            <Accordion.ItemContent>
              <Accordion.ItemBody>
                <VStack align="stretch" gap={3}>
                  <Text fontSize="sm" color="fg.muted">
                    {section.body}
                  </Text>
                  {section.action ? (
                    <HStack gap={2} flexWrap="wrap">
                      {section.action}
                    </HStack>
                  ) : null}
                </VStack>
              </Accordion.ItemBody>
            </Accordion.ItemContent>
          </Accordion.Item>
        ))}
      </Accordion.Root>

      <ButtonFeedback
        w="100%"
        beforeOpen={() => modalSend({ type: "CLOSE_HELP" })}
        label="Send feedback"
      />
    </VStack>
  )
}

export default AboutContent
