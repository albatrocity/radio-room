import { Box, Grid, HStack, ScrollArea, Text } from "@chakra-ui/react"
import ScrollShadowViewport from "../../../ScrollShadowViewport"
import { useIntegratedPanelPresentation } from "../../../../hooks/useIntegratedPanelPresentation"
import { PICKER_ROW_H, pickerStripHeight } from "./tradeDetailConstants"
import { TradeItemRow } from "./TradeItemRow"
import { useTradeOfferDraft } from "./useTradeOfferDraft"
import { useTradeParticipants } from "./useTradeParticipants"

/** Remaining bag items — pinned in Game State chrome below the compose field. */
export function TradeDetailInventoryPicker({ tradeId }: { tradeId: string }) {
  const { activeTrade } = useTradeParticipants(tradeId)
  const { definitionMap, selectable, remainingInventory, offeredCount, canEdit, addToOffer } =
    useTradeOfferDraft(tradeId)
  const presentation = useIntegratedPanelPresentation()
  const pickerRows = presentation === "panel" ? 2 : 1

  if (!activeTrade) return null

  const emptyCopy =
    selectable.length === 0 && offeredCount === 0
      ? "You have nothing to offer"
      : "You've offered all you have"

  return (
    <Box h={pickerStripHeight(pickerRows)} w="full" minW={0} overflow="hidden">
      <ScrollArea.Root width="full" height="full" size="xs">
        <ScrollShadowViewport
          orientation="horizontal"
          height="full"
          overflowY="hidden"
          css={{ "--scroll-shadow-size": "2rem" }}
        >
          <ScrollArea.Content height="full" minW="full">
            {remainingInventory.length > 0 ? (
              <Grid
                autoFlow="column"
                templateRows={`repeat(${pickerRows}, ${PICKER_ROW_H})`}
                autoColumns="max-content"
                gap={1}
                h="full"
              >
                {remainingInventory.map((item) => (
                  <TradeItemRow
                    key={item.unitKey}
                    name={item.name}
                    quantity={1}
                    def={definitionMap.get(item.definitionId)}
                    compact
                    onActivate={canEdit ? () => addToOffer(item.itemId) : undefined}
                    activateLabel={`Add ${item.name} to offer`}
                  />
                ))}
              </Grid>
            ) : (
              <HStack h="full" align="center" w="full">
                <Text fontSize="xs" color="fg.muted" lineHeight="short">
                  {emptyCopy}
                </Text>
              </HStack>
            )}
          </ScrollArea.Content>
        </ScrollShadowViewport>
      </ScrollArea.Root>
    </Box>
  )
}
