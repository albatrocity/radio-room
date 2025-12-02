import React, { ReactNode } from "react"
import {
  Button,
  PopoverRoot,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  PopoverArrow,
  PopoverCloseTrigger,
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
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button
          variant={triggerVariant as any}
          colorPalette={triggerColorScheme}
        >
          {triggerIcon}
          {triggerText}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverArrow />
        <PopoverCloseTrigger asChild position="absolute" top="1" right="1">
          <CloseButton size="sm" />
        </PopoverCloseTrigger>
        {!!popoverHeader && <PopoverHeader>{popoverHeader}</PopoverHeader>}
        {!!popoverBody && <PopoverBody>{popoverBody}</PopoverBody>}
        <PopoverFooter justifyContent="flex-end" display="flex">
          <Button colorPalette="red" onClick={onConfirm}>
            {confirmText}
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </PopoverRoot>
  )
}
