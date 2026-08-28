import { Box, Heading, HStack, Icon, Stack, Text, VStack } from "@chakra-ui/react"
import { LuLock, LuThumbsUp } from "react-icons/lu"
import type { TradeDraftItem, TradeOfferItem } from "@repo/types"
import { TradeItemRow } from "./TradeItemRow"
import type { TradeItemDef } from "./tradeDetailTypes"

function TradeNoteBubble({ message, typing }: { message?: string | null; typing?: boolean }) {
  const hasMessage = Boolean(message?.trim())
  if (!hasMessage && !typing) return null

  return (
    <Box
      position="relative"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      bg="bg.subtle"
      px={2}
      py={1.5}
    >
      {hasMessage ? (
        <Text fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-word" opacity={typing ? 0.1 : 1}>
          {message}
        </Text>
      ) : (
        // Reserve a line so typing alone doesn’t jump differently than a short note.
        <Text fontSize="xs" visibility="hidden" aria-hidden>
          typing…
        </Text>
      )}
      {typing ? (
        <Text
          position="absolute"
          inset={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontSize="xs"
          color="fg.muted"
          fontStyle="italic"
          pointerEvents="none"
        >
          typing…
        </Text>
      ) : null}
    </Box>
  )
}

export function TradeColumn({
  title,
  rows,
  definitionMap,
  note,
  typing,
  locked = false,
  confirmed = false,
  emptyCopy = "Nothing offered.",
  onRemoveFromOffer,
}: {
  title: string
  rows: (TradeOfferItem | TradeDraftItem)[]
  definitionMap: Map<string, TradeItemDef>
  note?: string | null
  typing?: boolean
  locked?: boolean
  confirmed?: boolean
  emptyCopy?: string
  onRemoveFromOffer?: (itemId: string) => void
}) {
  return (
    <VStack align="stretch" flex="1" minW={0} gap={2}>
      <HStack gap={1.5} minW={0} align="center">
        <Heading size="sm" truncate minW={0} title={title}>
          {title}
        </Heading>
        {locked ? (
          <Icon
            as={LuLock}
            boxSize={3.5}
            color="fg.muted"
            flexShrink={0}
            aria-label="Offer locked"
          />
        ) : null}
        {confirmed ? (
          <Icon
            as={LuThumbsUp}
            boxSize={3.5}
            color="fg.muted"
            flexShrink={0}
            aria-label="Trade confirmed"
          />
        ) : null}
      </HStack>
      <TradeNoteBubble message={note} typing={typing} />
      <Stack gap={2} minH="8rem">
        {rows.length === 0 && (
          <Text fontSize="sm" color="fg.muted">
            {emptyCopy}
          </Text>
        )}
        {rows.map((row) => {
          const defId = "definitionId" in row ? row.definitionId : ""
          const def = definitionMap.get(defId)
          const name =
            ("itemName" in row && row.itemName) ||
            def?.name ||
            defId ||
            ("itemId" in row ? row.itemId : "")
          const itemId = "itemId" in row ? row.itemId : row.originalItemId
          const key = "escrowKey" in row && row.escrowKey ? row.escrowKey : itemId || name
          return (
            <TradeItemRow
              key={key}
              name={name}
              quantity={row.quantity}
              def={def}
              onActivate={onRemoveFromOffer ? () => onRemoveFromOffer(itemId) : undefined}
              activateLabel={`Remove ${name} from offer`}
            />
          )
        })}
      </Stack>
    </VStack>
  )
}
