"use client"

import {
  Button,
  Card,
  Drawer,
  Field,
  Heading,
  HStack,
  NativeSelect,
  Separator,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react"
import { Archive, ShoppingBag } from "lucide-react"
import { useMemo, useState } from "react"
import * as studioActions from "../../studio/studioActions"
import { readShoppingInstance } from "../../studio/studioShoppingRead"
import type { StudioRoom } from "../../studio/studioRoom"
import { toaster } from "../ui/toaster"
import { ArtifactsDrawerTab } from "./ArtifactsDrawerTab"

export type AddItemDrawerProps = {
  room: StudioRoom
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddItemDrawer({ room, open, onOpenChange }: AddItemDrawerProps) {
  const { ITEM_CATALOG, SHOP_CATALOG } = studioActions.catalogExports()

  const catalogMap = useMemo(
    () => new Map(ITEM_CATALOG.map((entry) => [entry.definition.shortId, entry])),
    [ITEM_CATALOG],
  )

  const defaultUserId = useMemo(
    () => [...room.users.keys()][0] ?? "",
    [room.snapshotEpoch, room.users],
  )

  const [giveRecipientPick, setGiveRecipientPick] = useState<string | null>(null)
  const [buyRecipientPick, setBuyRecipientPick] = useState<string | null>(null)

  const giveRecipient = giveRecipientPick ?? defaultUserId
  const buyRecipient = buyRecipientPick ?? defaultUserId

  async function toastAction(
    title: string,
    fn: () => Promise<{ success: boolean; message?: string }>,
  ) {
    try {
      const res = await fn()
      toaster.create({
        title: res.success ? title : `${title} failed`,
        description: res.message,
        type: res.success ? "success" : "error",
      })
    } catch (e) {
      toaster.create({
        title: `${title} error`,
        description: String(e),
        type: "error",
      })
    }
  }

  const shoppingInstance = readShoppingInstance(room, buyRecipient)

  return (
    <Drawer.Root open={open} onOpenChange={(e) => onOpenChange(e.open)} placement="end" size="md">
      <Drawer.Backdrop />
      <Drawer.Positioner>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>
              <HStack gap="2">
                <ShoppingBag size={18} />
                Items & shops
              </HStack>
            </Drawer.Title>
          </Drawer.Header>
          <Drawer.Body pt="0">
            {room.users.size === 0 ? (
              <Text fontSize="sm" color="fg.muted">
                Add at least one user to grant items or run buys.
              </Text>
            ) : (
              <Tabs.Root defaultValue="give" variant="line" colorPalette="blue" p="0">
                <Tabs.List pos="sticky" top="0" bg="bg.subtle" zIndex="sticky">
                  <Tabs.Trigger value="give">Give (catalog)</Tabs.Trigger>
                  <Tabs.Trigger value="buy">Buy (shopping session)</Tabs.Trigger>
                  <Tabs.Trigger value="artifacts">
                    <HStack gap="1" display="inline-flex">
                      <Archive size={14} />
                      Artifacts
                    </HStack>
                  </Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="give">
                  <Stack gap="4">
                    <Field.Root>
                      <Field.Label fontSize="sm">Recipient</Field.Label>
                      <NativeSelect.Root size="sm">
                        <NativeSelect.Field
                          value={giveRecipient}
                          onChange={(e) => setGiveRecipientPick(e.target.value)}
                        >
                          {[...room.users.keys()].map((id) => (
                            <option key={id} value={id}>
                              {room.users.get(id)?.username ?? id}
                            </option>
                          ))}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    </Field.Root>

                    <Text fontSize="sm" color="fg.muted">
                      Grants bypass coins — useful for testing item behaviors quickly.
                    </Text>

                    {SHOP_CATALOG.map((shop) => (
                      <Card.Root key={shop.shopId}>
                        <Card.Header>
                          <Heading size="lg" color="fg.muted">
                            {shop.name}
                          </Heading>
                        </Card.Header>
                        <Card.Body>
                          <Stack key={shop.shopId} gap="2">
                            <Stack gap="4" separator={<Separator />}>
                              {shop.availableItems.map((available) => {
                                const shortId =
                                  typeof available === "string" ? available : available.shortId
                                const cat = catalogMap.get(shortId)
                                const label = cat?.definition.name ?? shortId
                                const desc = cat?.definition.description
                                return (
                                  <HStack key={shortId} justify="space-between" align="flex-start">
                                    <Stack gap="1" flex="1" minW="0">
                                      <Text fontSize="sm" fontWeight="medium">
                                        {label}
                                      </Text>
                                      {desc ? (
                                        <Text fontSize="xs" color="fg.muted">
                                          {desc}
                                        </Text>
                                      ) : null}
                                    </Stack>
                                    <Button
                                      size="xs"
                                      variant="surface"
                                      onClick={() =>
                                        void toastAction(`Give ${label}`, () =>
                                          studioActions.giveItemDirect(giveRecipient, shortId),
                                        )
                                      }
                                    >
                                      Give
                                    </Button>
                                  </HStack>
                                )
                              })}
                            </Stack>
                          </Stack>
                        </Card.Body>
                      </Card.Root>
                    ))}
                  </Stack>
                </Tabs.Content>

                <Tabs.Content value="buy">
                  <Stack gap="4" mt="4">
                    <Text fontSize="xs" color="fg.muted">
                      Users added before shopping started won&apos;t get shops until you replay
                      joins or add users again.
                    </Text>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        void toastAction("Assignments refreshed", () =>
                          studioActions.replayUserJoinedForAllUsers(),
                        )
                      }
                    >
                      Assign shops for existing users
                    </Button>
                    <Field.Root>
                      <Field.Label fontSize="sm">Buyer</Field.Label>
                      <NativeSelect.Root size="sm">
                        <NativeSelect.Field
                          value={buyRecipient}
                          onChange={(e) => setBuyRecipientPick(e.target.value)}
                        >
                          {[...room.users.keys()].map((id) => (
                            <option key={id} value={id}>
                              {room.users.get(id)?.username ?? id}
                            </option>
                          ))}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    </Field.Root>

                    {!shoppingInstance ? (
                      <Text fontSize="sm" color="fg.muted">
                        Start a shopping round and open this user&apos;s shop (assign-on-join flow
                        runs after session + shopping start).
                      </Text>
                    ) : (
                      <Card.Root>
                        <Card.Header>
                          <Heading size="lg" color="fg.muted">
                            {shoppingInstance.shopName}
                            <Text as="span" fontSize="xs" color="fg.muted" display="block">
                              Round opened at {new Date(shoppingInstance.openedAt).toLocaleString()}
                            </Text>
                          </Heading>
                        </Card.Header>
                        <Card.Body>
                          <Stack gap="4" separator={<Separator />}>
                            <Stack gap="4" separator={<Separator />}>
                              {shoppingInstance.offers.length === 0 ? (
                                <Text fontSize="sm">No offers generated.</Text>
                              ) : (
                                shoppingInstance.offers.map((offer) => (
                                  <HStack
                                    key={`${offer.offerId}-${offer.shortId}`}
                                    justify="space-between"
                                    align="flex-start"
                                  >
                                    <Stack gap="1" align="flex-start" flex="1" minW="0">
                                      <Text fontWeight="medium">{offer.name}</Text>
                                      {offer.description ? (
                                        <Text fontSize="xs" color="fg.muted">
                                          {offer.description}
                                        </Text>
                                      ) : null}
                                      <Text fontSize="xs" color="fg.muted">
                                        {offer.price} coins ·{" "}
                                        {offer.available ? "available" : "sold"}
                                      </Text>
                                    </Stack>
                                    <Button
                                      size="xs"
                                      colorPalette="blue"
                                      disabled={!offer.available}
                                      onClick={() =>
                                        void toastAction(`Buy ${offer.name}`, () =>
                                          studioActions.purchaseOffer(buyRecipient, offer.offerId),
                                        )
                                      }
                                    >
                                      Buy
                                    </Button>
                                  </HStack>
                                ))
                              )}
                            </Stack>
                          </Stack>
                        </Card.Body>
                      </Card.Root>
                    )}
                  </Stack>
                </Tabs.Content>

                <Tabs.Content value="artifacts">
                  <ArtifactsDrawerTab room={room} defaultUserId={defaultUserId} />
                </Tabs.Content>
              </Tabs.Root>
            )}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer.Positioner>
    </Drawer.Root>
  )
}
