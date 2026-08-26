import type { ReactNode } from "react"
import {
  Box,
  CloseButton,
  Flex,
  Heading,
  IconButton,
} from "@chakra-ui/react"
import { LuArrowLeft } from "react-icons/lu"

type Props = {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  showBack?: boolean
  onBack?: () => void
}

export function IntegratedPanelShell({
  title,
  onClose,
  children,
  footer,
  showBack = false,
  onBack,
}: Props) {
  return (
    <Box
      h="100%"
      minH={0}
      w="100%"
      overflow="hidden"
      borderLeftWidth={1}
      borderLeftStyle="solid"
      borderLeftColor="secondaryBorder"
      bg="appBg"
      colorPalette="secondary"
      className="integrated-panel"
    >
      <Flex direction="column" h="100%" minH={0} w="100%">
        <Flex
          align="center"
          justify="space-between"
          gap={2}
          px={3}
          py={2}
          borderBottomWidth={1}
          borderBottomColor="border"
          flexShrink={0}
        >
          <Flex align="center" gap={1} minW={0}>
            {showBack && onBack ? (
              <IconButton onClick={onBack} aria-label="Back" variant="ghost" size="sm">
                <LuArrowLeft />
              </IconButton>
            ) : null}
            <Heading size="md" truncate>
              {title}
            </Heading>
          </Flex>
          <CloseButton size="sm" onClick={onClose} aria-label="Close panel" />
        </Flex>

        <Box flex="1" minH={0} overflowY="auto" px={3} py={3}>
          {children}
        </Box>

        {footer ? (
          <Box px={3} pb={3} pt={0} flexShrink={0}>
            {footer}
          </Box>
        ) : null}
      </Flex>
    </Box>
  )
}

export default IntegratedPanelShell
