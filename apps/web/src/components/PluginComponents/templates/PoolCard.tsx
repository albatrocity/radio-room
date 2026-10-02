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
import { LuMaximize2, LuMinus, LuPiggyBank } from "react-icons/lu"
import type { PoolCardView } from "@repo/types"
import { emitToSocket } from "../../../actors/socketActor"
import { subscribeForSocketResult } from "../../../lib/subscribeForSocketResult"
import { toaster } from "../../ui/toaster"
import { ExpiryBar } from "../../ExpiryBar"
import ParsedEmojiMessage from "../../ParsedEmojiMessage"
import { usePluginComponentContext } from "../context"
import type { PoolCardComponentProps } from "../../../types/PluginComponent"

/**
 * aboveChat card for a voluntary coin pool — Kickstarter campaigns (ADR 0188),
 * road trip gas funds (ADR 0204). Collapsible chrome matches Poll cards;
 * ExpiryBar drains the pool's deadline.
 */
export function PoolCardTemplateComponent({
  poolKey = "pool",
  pledgeAction,
  pledgeLabel = "Chip in",
  defaultAmount = 5,
}: PoolCardComponentProps) {
  const { store, pluginName } = usePluginComponentContext()
  const pool = store[poolKey] as PoolCardView | null | undefined
  const [amount, setAmount] = useState(String(defaultAmount))
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [subId] = useState(() => `pool-pledge-${Math.random().toString(36).slice(2)}`)

  if (!pool) return null

  const progress = pool.goal > 0 ? Math.min(100, Math.round((pool.raised / pool.goal) * 100)) : 0
  const startedAt =
    pool.endsAt !== null && pool.startedAt < pool.endsAt ? pool.startedAt : Date.now()
  const showExpiryBar = pool.endsAt !== null && pool.endsAt > Date.now()

  const submitPledge = () => {
    if (!pluginName || !pool.open) return
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
      action: pledgeAction,
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
                {pool.icon ? <Text as="span">{pool.icon}</Text> : <LuPiggyBank />}
              </Box>
              {collapsed ? (
                <Text fontSize="sm" truncate>
                  {pool.title} · {pool.raised}/{pool.goal}
                  {pool.eyebrow ? ` · ${pool.eyebrow}` : ""}
                </Text>
              ) : pool.eyebrow ? (
                <Text fontSize="xs" color="fg.muted">
                  {pool.eyebrow}
                </Text>
              ) : null}
            </HStack>
            <IconButton
              aria-label={collapsed ? "Expand" : "Collapse"}
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
                  {pool.title}
                </Text>
                {pool.subtitle ? (
                  <Text fontSize="xs" color="fg.muted">
                    {pool.subtitle}
                  </Text>
                ) : null}
              </Stack>
              {pool.body ? (
                <Stack gap={0}>
                  {pool.bodyLabel ? (
                    <Text fontSize="xs" fontWeight="bold">
                      {pool.bodyLabel}
                    </Text>
                  ) : null}
                  <Box fontSize="sm">
                    <ParsedEmojiMessage content={pool.body} />
                  </Box>
                </Stack>
              ) : null}
              <Box>
                <HStack justify="space-between" mb={1}>
                  <Text fontSize="xs">
                    {pool.raised} / {pool.goal} coin
                  </Text>
                  <Text fontSize="xs">{progress}%</Text>
                </HStack>
                <Progress.Root value={progress} max={100} size="sm" colorPalette="primary">
                  <Progress.Track>
                    <Progress.Range />
                  </Progress.Track>
                </Progress.Root>
              </Box>
              {pool.topContributors?.length ? (
                <Text fontSize="xs" color="fg.muted">
                  Top: {pool.topContributors.map((c) => `${c.name} (${c.amount})`).join(", ")}
                </Text>
              ) : null}
              {pool.open ? (
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
                    {pledgeLabel}
                  </Button>
                </HStack>
              ) : null}
            </VStack>
          )}
        </Box>

        {showExpiryBar && pool.endsAt !== null && (
          <ExpiryBar startAt={startedAt} endAt={pool.endsAt} color="primary.solid" height="3px" />
        )}
      </Box>
    </Box>
  )
}
