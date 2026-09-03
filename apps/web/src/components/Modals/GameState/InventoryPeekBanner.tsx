import { Box, Button, HStack, Text } from "@chakra-ui/react"
import { UserInventoryItemPicker } from "./UserInventoryItemPicker"

/** Banner + Look-at control while the current user has `inventory_peek` (X-Ray). */
export function InventoryPeekBanner() {
  return (
    <Box
      mb={3}
      p={3}
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      bg="bg.subtle"
    >
      <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
        <Text fontSize="sm" color="fg.muted" flex="1" minW="12rem">
          X-Ray is active — you can look through other listeners&apos; inventories.
        </Text>
        <UserInventoryItemPicker mode="view" fullWidth={false}>
          <Button size="sm" variant="solid" colorPalette="action">
            Look at…
          </Button>
        </UserInventoryItemPicker>
      </HStack>
    </Box>
  )
}
