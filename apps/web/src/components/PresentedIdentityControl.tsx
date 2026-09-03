import { HStack, Icon, SegmentGroup, Stack, Text } from "@chakra-ui/react"
import { useSelector } from "@xstate/react"
import { useCallback, type ReactNode } from "react"
import {
  isPresentedIdentityGrantActive,
  presentedIdentityChromeLabel,
} from "@repo/game-logic"
import type { LucideIconName, PresentedIdentityGrant } from "@repo/types"
import { emitToSocket } from "../actors/socketActor"
import { userGameStateActor } from "../actors/userGameStateActor"
import { useCurrentUser } from "../hooks/useActors"
import { getIcon } from "./PluginComponents/icons"

function IdentityLabel({
  label,
  icon,
}: {
  label: string
  icon?: LucideIconName | string | null
}): ReactNode {
  const IconComp = icon ? getIcon(icon) : undefined
  if (!IconComp) return label
  return (
    <HStack gap={1.5} as="span" alignItems="center">
      <Icon as={IconComp} boxSize={3.5} />
      <Text as="span">{label}</Text>
    </HStack>
  )
}

/**
 * aboveChat chrome for the current user's presented-identity grant (ADR 0150).
 * Toggleable grants use SegmentGroup; fixed grants show a read-only label.
 * Uses {@link presentedIdentityChromeLabel} (not the action attribution label).
 */
export function PresentedIdentityControl() {
  const currentUser = useCurrentUser()
  const grant = useSelector(
    userGameStateActor,
    (s) => s.context.payload?.presentedIdentity ?? null,
  ) as PresentedIdentityGrant | null
  const active = isPresentedIdentityGrantActive(grant)
  const realName = currentUser?.username?.trim() || "You"

  const onValueChange = useCallback(
    (details: { value: string | null }) => {
      if (!grant?.toggleable || details.value == null) return
      const engaged = details.value === "presented"
      emitToSocket("SET_PRESENTED_IDENTITY_ENGAGED", { engaged })
    },
    [grant?.toggleable],
  )

  if (!active || !grant) return null

  const chromeLabel = presentedIdentityChromeLabel(grant)

  if (!grant.toggleable) {
    return (
      <Stack direction="row" p={2} alignItems="center" justifyContent="center" gap={2}>
        <Text fontSize="sm" color="fg.muted">
          Act as
        </Text>
        <Text fontSize="sm" fontWeight="medium">
          <IdentityLabel label={chromeLabel} icon={grant.icon} />
        </Text>
      </Stack>
    )
  }

  const value = grant.engaged ? "presented" : "real"

  return (
    <Stack direction="row" p={2} alignItems="center" justifyContent="center" gap={2}>
      <Text fontSize="sm" color="fg.muted">
        Act as
      </Text>
      <SegmentGroup.Root size="sm" value={value} onValueChange={onValueChange}>
        <SegmentGroup.Indicator />
        <SegmentGroup.Item value="real">
          <SegmentGroup.ItemText>{realName}</SegmentGroup.ItemText>
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
        <SegmentGroup.Item value="presented">
          <SegmentGroup.ItemText>
            <IdentityLabel label={chromeLabel} icon={grant.icon} />
          </SegmentGroup.ItemText>
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      </SegmentGroup.Root>
    </Stack>
  )
}
