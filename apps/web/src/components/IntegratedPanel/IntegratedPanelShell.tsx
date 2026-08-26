import type { ReactNode } from "react"
import {
  Box,
  CloseButton,
  Flex,
  Heading,
  IconButton,
} from "@chakra-ui/react"
import { LuArrowLeft } from "react-icons/lu"

import { INTEGRATED_PANEL_WIDTH } from "../../lib/integratedPanelSlots"
import { useAnimationsEnabled } from "../../hooks/useReducedMotion"

type Props = {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  showBack?: boolean
  onBack?: () => void
  /** When false, width animates to 0 (grid column may still exist during exit). */
  open?: boolean
}

export function IntegratedPanelShell({
  title,
  onClose,
  children,
  footer,
  showBack = false,
  onBack,
  open = true,
}: Props) {
  const animationsEnabled = useAnimationsEnabled()

  return (
    <Box
      h="100%"
      minH={0}
      overflow="hidden"
      w={open ? INTEGRATED_PANEL_WIDTH : 0}
      maxW={open ? INTEGRATED_PANEL_WIDTH : 0}
      opacity={open ? 1 : 0}
      transition={
        animationsEnabled
          ? "width 0.25s ease, max-width 0.25s ease, opacity 0.2s ease"
          : undefined
      }
      borderLeftWidth={open ? 1 : 0}
      borderLeftStyle="solid"
      borderLeftColor="secondaryBorder"
      bg="appBg"
      layerStyle="themeTransition"
      colorPalette="secondary"
      className="integrated-panel"
    >
      <Flex
        direction="column"
        h="100%"
        minH={0}
        w={INTEGRATED_PANEL_WIDTH}
        minW={INTEGRATED_PANEL_WIDTH}
      >
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
