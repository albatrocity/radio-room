import React, { ReactNode } from "react"
import {
  Button,
  Popover,
  CloseButton,
} from "@chakra-ui/react"

type Props = {
  triggerIcon?: React.ReactNode
  triggerText: string
  triggerColorScheme?: string
  triggerVariant?: string
  popoverHeader?: string
  popoverBody?: ReactNode | string
  confirmText?: string
  onConfirm: () => void
}

export default function ConfirmationPopover({
  triggerIcon,
  triggerText,
  triggerColorScheme,
  triggerVariant,
  popoverHeader,
  popoverBody,
  onConfirm,
  confirmText = "Confirm",
}: Props) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          variant={triggerVariant as any}
          colorPalette={triggerColorScheme}
        >
          {triggerIcon}
          {triggerText}
        </Button>
      </Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content>
          <Popover.Arrow />
          <Popover.CloseTrigger asChild position="absolute" top="1" right="1">
            <CloseButton size="sm" />
          </Popover.CloseTrigger>
          {!!popoverHeader && <Popover.Header>{popoverHeader}</Popover.Header>}
          {!!popoverBody && <Popover.Body>{popoverBody}</Popover.Body>}
          <Popover.Footer justifyContent="flex-end" display="flex">
            <Button colorPalette="red" onClick={onConfirm}>
              {confirmText}
            </Button>
          </Popover.Footer>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
