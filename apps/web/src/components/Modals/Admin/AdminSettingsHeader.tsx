import { HStack, Heading, IconButton } from "@chakra-ui/react"
import { LuArrowLeft } from "react-icons/lu"

type Props = {
  showBack: boolean
  onBack: () => void
}

export function AdminSettingsHeader({ showBack, onBack }: Props) {
  return (
    <HStack>
      {showBack ? (
        <IconButton onClick={onBack} aria-label="back" variant="ghost">
          <LuArrowLeft />
        </IconButton>
      ) : null}
      <Heading size="lg">Settings</Heading>
    </HStack>
  )
}
