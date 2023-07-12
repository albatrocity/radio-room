import React, { ReactNode } from "react"
import {
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  PopoverArrow,
  PopoverCloseButton,
  ButtonProps,
} from "@chakra-ui/react"

type Props = {
  triggerIcon?: ButtonProps["leftIcon"]
  triggerText: string
  triggerColorScheme?: string
  triggerVariant?: ButtonProps["variant"]
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
    <Popover>
      <PopoverTrigger>
        <Button
          variant={triggerVariant}
          colorScheme={triggerColorScheme}
          leftIcon={triggerIcon}
        >
          {triggerText}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverArrow />
        {!!popoverHeader && <PopoverHeader>{popoverHeader}</PopoverHeader>}
        {!!popoverBody && <PopoverBody>{popoverBody}</PopoverBody>}
        <PopoverFooter justifyContent="flex-end" display="flex">
          <Button colorScheme="red" onClick={onConfirm}>
            {confirmText}
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  )
}
