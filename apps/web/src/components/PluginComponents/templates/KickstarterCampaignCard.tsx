import { useState } from "react"
import {
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Progress,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import { LuMaximize2, LuMinus, LuRocket } from "react-icons/lu"
import { emitToSocket } from "../../../actors/socketActor"
import { subscribeForSocketResult } from "../../../lib/subscribeForSocketResult"
import { toaster } from "../../ui/toaster"
import { ExpiryBar } from "../../ExpiryBar"
import ParsedEmojiMessage from "../../ParsedEmojiMessage"
import { usePluginComponentContext } from "../context"
import type { KickstarterCampaignCardComponentProps } from "../../../types/PluginComponent"

/** Public campaign slice from plugin store (no per-backer pledges). */
type CampaignView = {
  title: string
  rewards: string
  goal: number
  pledged: number
  ownerName: string
  phase: "funding" | "deliveryWait" | "poll"
  phaseStartedAt: number
  phaseEndsAt: number
}

/**
 * aboveChat card for an active Kickstarter campaign (ADR 0188).
 * Collapsible chrome matches Quiz / Lyric Hero cards; ExpiryBar drains the phase timer.
 */
export function KickstarterCampaignCardTemplateComponent({
  backLabel = "Back this campaign",
}: KickstarterCampaignCardComponentProps) {
  const { store, pluginName } = usePluginComponentContext()
  const campaign = store.campaign as CampaignView | null | undefined
  const [amount, setAmount] = useState("5")
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [subId] = useState(() => `kickstarter-back-${Math.random().toString(36).slice(2)}`)

  if (!campaign) return null

  const progress =
    campaign.goal > 0 ? Math.min(100, Math.round((campaign.pledged / campaign.goal) * 100)) : 0
  const phaseLabel =
    campaign.phase === "funding"
      ? "Funding"
      : campaign.phase === "deliveryWait"
      ? "Awaiting delivery"
      : "Delivery review"

  const phaseStartedAt =
    typeof campaign.phaseStartedAt === "number" && campaign.phaseStartedAt < campaign.phaseEndsAt
      ? campaign.phaseStartedAt
      : Date.now()
  const showExpiryBar =
    typeof campaign.phaseEndsAt === "number" && campaign.phaseEndsAt > Date.now()

  const submitPledge = () => {
    if (!pluginName || campaign.phase !== "funding") return
    const n = Math.floor(Number(amount))
    if (!Number.isFinite(n) || n < 1) {
      toaster.create({
        title: "Invalid amount",
        description: "Pledge at least 1 coin.",
        type: "error",
      })
      return
    }
    setLoading(true)
    subscribeForSocketResult<{ success: boolean; message?: string }>({
      id: `${subId}-${Date.now()}`,
      eventType: "PLUGIN_ACTION_RESULT",
      onResult: (data) => {
        setLoading(false)
        toaster.create({
          title: data.success ? "Pledge sent" : "Pledge failed",
          description: data.message,
          type: data.success ? "success" : "error",
        })
      },
      onTimeout: () => {
        setLoading(false)
        toaster.create({ title: "Timeout", description: "Pledge timed out", type: "error" })
      },
    })
    emitToSocket("EXECUTE_PLUGIN_ACTION", {
      pluginName,
      action: "backCampaign",
      params: { amount: n },
    })
  }

  return (
    <Box width="full">
      <Box borderWidth="1px" borderRadius="lg" bg="bg" shadow="sm" overflow="hidden">
        <Box px={3} py={collapsed ? 2 : 3}>
          <HStack justify="space-between" align="center" gap={2}>
            <HStack gap={2} minW={0} flex={1}>
              <Box color="primary.solid" flexShrink={0}>
                <LuRocket />
              </Box>
              {collapsed ? (
                <Text fontSize="sm" truncate>
                  {campaign.title} · {campaign.pledged}/{campaign.goal} · {phaseLabel}
                </Text>
              ) : (
                <Text fontSize="xs" color="fg.muted">
                  Kickstarter · {phaseLabel}
                </Text>
              )}
            </HStack>
            <IconButton
              aria-label={collapsed ? "Expand Kickstarter" : "Collapse Kickstarter"}
              size="xs"
              variant="ghost"
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? <LuMaximize2 /> : <LuMinus />}
            </IconButton>
          </HStack>

          {!collapsed && (
            <VStack align="stretch" gap={2} mt={0} minW={0}>
              <Stack gap={0}>
                <Text fontSize="sm" fontWeight="bold" lineClamp={2}>
                  {campaign.title}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  by {campaign.ownerName}
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text fontSize="xs" fontWeight="bold">
                  Rewards
                </Text>
                <Box fontSize="sm">
                  <ParsedEmojiMessage content={campaign.rewards} />
                </Box>
              </Stack>
              <Box>
                <HStack justify="space-between" mb={1}>
                  <Text fontSize="xs">
                    {campaign.pledged} / {campaign.goal} coin
                  </Text>
                  <Text fontSize="xs">{progress}%</Text>
                </HStack>
                <Progress.Root value={progress} max={100} size="sm" colorPalette="primary">
                  <Progress.Track>
                    <Progress.Range />
                  </Progress.Track>
                </Progress.Root>
              </Box>
              {campaign.phase === "funding" ? (
                <HStack gap={2}>
                  <Input
                    size="sm"
                    type="number"
                    min={1}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    maxW="100px"
                  />
                  <Button
                    size="sm"
                    colorPalette="action"
                    loading={loading}
                    onClick={submitPledge}
                    flex="1"
                  >
                    {backLabel}
                  </Button>
                </HStack>
              ) : null}
            </VStack>
          )}
        </Box>

        {showExpiryBar && (
          <ExpiryBar
            startAt={phaseStartedAt}
            endAt={campaign.phaseEndsAt}
            color="primary.solid"
            height="3px"
          />
        )}
      </Box>
    </Box>
  )
}
