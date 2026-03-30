import type { MouseEvent, PointerEvent } from "react"
import { Avatar, Button, Menu, Text, HStack, Spinner, Box, Portal } from "@chakra-ui/react"

/**
 * Minimal admin / assignee row for the picker list and optimistic updates.
 * Callers can use {@link SchedulingAdminUserDTO} from `@repo/types`.
 */
export type AssigneePickerUser = {
  id: string
  name: string
  /** Profile image URL (e.g. from OAuth); optional for minimal callers. */
  image?: string | null
}

export interface AssigneePickerProps<TUser extends AssigneePickerUser = AssigneePickerUser> {
  /** Shown in aria labels, e.g. "segment" → "Assign segment". */
  entityLabel: string
  assignedUserId: string | null
  /** Resolved assignee for display; null when unassigned. */
  assignee: TUser | null
  candidateUsers: TUser[]
  adminsLoading: boolean
  isSaving: boolean
  onAssign: (user: TUser) => void
  onUnassign: () => void
}

export function AssigneePicker<TUser extends AssigneePickerUser = AssigneePickerUser>({
  entityLabel,
  assignedUserId,
  assignee,
  candidateUsers,
  adminsLoading,
  isSaving,
  onAssign,
  onUnassign,
}: AssigneePickerProps<TUser>) {
  const assignLabel = assignee ? `Assigned to ${assignee.name}` : `Assign ${entityLabel}`

  /** Let hits register on the <button> so @dnd-kit's pointer sensor treats this as interactive and skips drag. */
  const triggerPointerPassthroughCss = {
    "& *": { pointerEvents: "none" as const },
  }

  /** Menu is portaled; stop bubbling so SegmentCard's onClick does not open the drawer after selecting. */
  function stopCardPointerBubble(e: MouseEvent | PointerEvent) {
    e.stopPropagation()
  }

  return (
    <Box data-assignee-picker="" position="relative" zIndex={1} isolation="isolate" flexShrink={0}>
      <Menu.Root lazyMount positioning={{ placement: "bottom-start", gutter: 4 }} closeOnSelect>
        <Menu.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            p={1}
            minW="unset"
            h="auto"
            borderRadius="full"
            lineHeight={0}
            aria-label={assignLabel}
            opacity={isSaving ? 0.6 : 1}
            css={triggerPointerPassthroughCss}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar.Root size="2xs" colorPalette="gray">
              {assignee?.image ? <Avatar.Image src={assignee.image} alt="" /> : null}
              <Avatar.Fallback name={assignee?.name} />
            </Avatar.Root>
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner zIndex="dropdown">
            <Menu.Content
              data-assignee-picker-menu=""
              minW="220px"
              maxH="min(280px, var(--available-height, 70vh))"
              overflowY="auto"
              onPointerDown={stopCardPointerBubble}
              onClick={stopCardPointerBubble}
            >
              {adminsLoading ? (
                <HStack justify="center" py={6}>
                  <Spinner size="sm" />
                </HStack>
              ) : (
                <>
                  {assignedUserId ? (
                    <>
                      <Menu.Item
                        value="__unassign__"
                        onClick={onUnassign}
                        colorPalette="red"
                        css={triggerPointerPassthroughCss}
                      >
                        Clear assignee
                      </Menu.Item>
                      <Menu.Separator />
                    </>
                  ) : null}
                  {candidateUsers.map((user) => (
                    <Menu.Item
                      key={user.id}
                      value={user.id}
                      onClick={() => onAssign(user)}
                      css={triggerPointerPassthroughCss}
                      bg={assignedUserId === user.id ? "bg.subtle" : undefined}
                    >
                      <HStack gap={2}>
                        <Avatar.Root size="2xs">
                          {user.image ? <Avatar.Image src={user.image} alt="" /> : null}
                          <Avatar.Fallback name={user.name} />
                        </Avatar.Root>
                        <Text fontSize="sm" lineClamp={1}>
                          {user.name}
                        </Text>
                      </HStack>
                    </Menu.Item>
                  ))}
                </>
              )}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </Box>
  )
}
