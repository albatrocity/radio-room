import { Box, Button, Icon, Status, type ButtonProps } from "@chakra-ui/react"
import { Gift } from "lucide-react"
import {
  useHasWhatsNewContent,
  useModalsSend,
  useSurfaceHasNotifications,
} from "../hooks/useActors"

type Props = {
  variant?: ButtonProps["variant"]
  colorPalette?: ButtonProps["colorPalette"]
  w?: ButtonProps["w"]
  flex?: ButtonProps["flex"]
  /** Called before opening Changelog (e.g. close Preferences). */
  beforeOpen?: () => void
  label?: string
}

/** Opens the listener Changelog modal. Hidden when the changelog has no months. */
function ButtonWhatsNew({
  variant = "outline",
  colorPalette = "action",
  w,
  flex,
  beforeOpen,
  label = "Changelog",
}: Props) {
  const modalSend = useModalsSend()
  const hasContent = useHasWhatsNewContent()
  const hasAttention = useSurfaceHasNotifications("whatsNew")

  if (!hasContent) return null

  const openWhatsNew = () => {
    beforeOpen?.()
    modalSend({ type: "VIEW_WHATS_NEW" })
  }

  return (
    <Box position="relative" w={w} flex={flex} minW={0}>
      <Button variant={variant} w="100%" colorPalette={colorPalette} onClick={openWhatsNew}>
        <Icon as={Gift} />
        {label}
      </Button>
      {hasAttention ? (
        <Status.Root
          size="sm"
          colorPalette="primary"
          position="absolute"
          top="0"
          right="0"
          transform="translate(25%, -25%)"
          pointerEvents="none"
        >
          <Status.Indicator />
        </Status.Root>
      ) : null}
    </Box>
  )
}

export default ButtonWhatsNew
