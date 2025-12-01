import React, { createContext, useContext, useState, useEffect, useMemo } from "react"
import { useMachine } from "@xstate/react"
import {
  Box,
  Button,
  Icon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
  HStack,
} from "@chakra-ui/react"
import { FaTrophy, FaStar, FaMedal, FaAward, FaHeart } from "react-icons/fa"
import { interpolateTemplate } from "@repo/utils"
import { pluginComponentMachine } from "../../machines/pluginComponentMachine"
import { getPluginComponentState } from "../../lib/serverApi"
import { useRoomStore } from "../../state/roomStore"
import type {
  PluginComponentDefinition,
  PluginTextComponent,
  PluginEmojiComponent,
  PluginIconComponent,
  PluginButtonComponent,
  PluginLeaderboardComponent,
  PluginModalComponent,
  PluginComponentState,
  LeaderboardEntry,
} from "../../types/PluginComponent"

// ============================================================================
// Context
// ============================================================================

interface PluginComponentContextValue {
  store: PluginComponentState
  config: Record<string, unknown>
  openModal: (modalId: string) => void
  closeModal: (modalId: string) => void
}

const PluginComponentContext = createContext<PluginComponentContextValue | null>(null)

function usePluginComponentContext() {
  const ctx = useContext(PluginComponentContext)
  if (!ctx) {
    throw new Error("PluginComponent must be rendered within PluginComponentProvider")
  }
  return ctx
}

// ============================================================================
// Icon Mapping
// ============================================================================

const ICON_MAP: Record<string, React.ComponentType> = {
  trophy: FaTrophy,
  star: FaStar,
  medal: FaMedal,
  award: FaAward,
  heart: FaHeart,
}

function getIcon(iconName: string): React.ComponentType | undefined {
  return ICON_MAP[iconName.toLowerCase()]
}

// ============================================================================
// Component Renderers
// ============================================================================

function PluginTextRenderer({ component }: { component: PluginTextComponent }) {
  const { store } = usePluginComponentContext()

  const content = interpolateTemplate(component.content, store)

  const fontWeight = component.variant === "bold" ? "bold" : "normal"
  const fontSize = component.variant === "small" ? "xs" : "sm"
  const color = component.variant === "muted" ? "gray.500" : undefined

  return (
    <Text fontSize={fontSize} fontWeight={fontWeight} color={color}>
      {content}
    </Text>
  )
}

function PluginEmojiRenderer({ component }: { component: PluginEmojiComponent }) {
  const sizeMap = { sm: "16px", md: "24px", lg: "32px" }
  const size = sizeMap[component.size || "md"]

  return (
    <Box fontSize={size}>
      {/* @ts-ignore - em-emoji is a custom element from emoji-mart */}
      <em-emoji shortcodes={`:${component.emoji}:`} />
    </Box>
  )
}

function PluginIconRenderer({ component }: { component: PluginIconComponent }) {
  const IconComponent = getIcon(component.icon)
  if (!IconComponent) {
    console.warn(`[PluginComponent] Unknown icon: ${component.icon}`)
    return null
  }

  const sizeMap = { sm: 3, md: 4, lg: 5 }
  const boxSize = sizeMap[component.size || "md"]

  return <Icon as={IconComponent} boxSize={boxSize} color={component.color} />
}

function PluginButtonRenderer({ component }: { component: PluginButtonComponent }) {
  const { openModal } = usePluginComponentContext()
  const IconComponent = component.icon ? getIcon(component.icon) : undefined

  const handleClick = () => {
    if (component.opensModal) {
      openModal(component.opensModal)
    }
  }

  return (
    <Button
      size={component.size || "sm"}
      variant={component.variant || "ghost"}
      leftIcon={IconComponent ? <Icon as={IconComponent} /> : undefined}
      onClick={handleClick}
    >
      {component.label}
    </Button>
  )
}

function PluginLeaderboardRenderer({ component }: { component: PluginLeaderboardComponent }) {
  const { store } = usePluginComponentContext()

  const data = store[component.dataKey] as LeaderboardEntry[] | undefined
  if (!data || !Array.isArray(data)) {
    return (
      <Box>
        <Text fontSize="sm" color="gray.500">
          No data available
        </Text>
      </Box>
    )
  }

  // Sort by score descending and limit items
  const sortedData = [...data].sort((a, b) => b.score - a.score).slice(0, component.maxItems || 10)

  const rowTemplate = component.rowTemplate || "{{value}}: {{score}}"

  return (
    <VStack align="stretch" spacing={2}>
      {component.title && (
        <Text fontSize="md" fontWeight="bold">
          {component.title}
        </Text>
      )}
      {sortedData.map((entry, index) => {
        const rank = index + 1
        const content = interpolateTemplate(rowTemplate, {
          value: entry.value,
          score: entry.score,
          rank,
        })

        return (
          <HStack key={entry.value} spacing={2}>
            {component.showRank !== false && (
              <Text fontSize="sm" color="gray.500" minW="24px">
                {rank}.
              </Text>
            )}
            <Text fontSize="sm">{content}</Text>
          </HStack>
        )
      })}
      {sortedData.length === 0 && (
        <Text fontSize="sm" color="gray.500">
          No entries yet
        </Text>
      )}
    </VStack>
  )
}

function PluginModalRenderer({ component }: { component: PluginModalComponent }) {
  // Modal is rendered by PluginModalManager, not inline
  return null
}

// ============================================================================
// Main Renderer
// ============================================================================

interface PluginComponentRendererProps {
  component: PluginComponentDefinition
}

/**
 * Renders a single plugin component based on its type.
 */
export function PluginComponentRenderer({ component }: PluginComponentRendererProps) {
  const { config } = usePluginComponentContext()

  // Check enabledWhen condition
  if (component.enabledWhen) {
    const configValue = config[component.enabledWhen]
    if (!configValue) {
      return null
    }
  }

  switch (component.type) {
    case "text":
      return <PluginTextRenderer component={component} />
    case "emoji":
      return <PluginEmojiRenderer component={component} />
    case "icon":
      return <PluginIconRenderer component={component} />
    case "button":
      return <PluginButtonRenderer component={component} />
    case "leaderboard":
      return <PluginLeaderboardRenderer component={component} />
    case "modal":
      return <PluginModalRenderer component={component} />
    default:
      console.warn(`[PluginComponent] Unknown component type: ${(component as any).type}`)
      return null
  }
}

// ============================================================================
// Provider & Modal Manager
// ============================================================================

interface PluginComponentProviderProps {
  children: React.ReactNode
  pluginName: string
  storeKeys: string[]
  config: Record<string, unknown>
  components: PluginComponentDefinition[]
}

/**
 * Provides context for plugin components and manages modals.
 * Owns an XState machine instance for managing component state.
 */
export function PluginComponentProvider({
  children,
  pluginName,
  storeKeys,
  config,
  components,
}: PluginComponentProviderProps) {
  const { state: roomState } = useRoomStore()
  const roomId = roomState.context.room?.id
  const [openModals, setOpenModals] = useState<Set<string>>(new Set())

  // Create machine instance for this plugin
  const [state, send] = useMachine(
    pluginComponentMachine.withConfig({
      services: {
        fetchComponentState: async (context) => {
          if (!context.roomId) {
            throw new Error("Room ID is required")
          }
          const response = await getPluginComponentState(context.roomId, context.pluginName)
          return response.state
        },
      },
    }),
    {
      context: {
        pluginName,
        roomId: null,
        storeKeys,
        store: {},
        error: null,
      },
    },
  )

  // Update machine context when roomId changes - machine will auto-fetch via 'always' guard
  // Machine also handles socket subscriptions in the 'ready' state
  useEffect(() => {
    if (!roomId) return
    send({ type: "SET_ROOM_ID", roomId })
  }, [roomId, send])

  const openModal = (modalId: string) => {
    setOpenModals((prev) => new Set([...prev, modalId]))
  }

  const closeModal = (modalId: string) => {
    setOpenModals((prev) => {
      const next = new Set(prev)
      next.delete(modalId)
      return next
    })
  }

  // Find all modal components
  const modalComponents = components.filter((c): c is PluginModalComponent => c.type === "modal")

  // Use store from machine state
  const store = state.context.store

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(
    () => ({ store, config, openModal, closeModal }),
    [store, config, openModal, closeModal],
  )

  return (
    <PluginComponentContext.Provider value={contextValue}>
      {children}

      {/* Render modal components */}
      {modalComponents.map((modal) => (
        <Modal
          key={modal.id}
          isOpen={openModals.has(modal.id)}
          onClose={() => closeModal(modal.id)}
          size={modal.size || "md"}
        >
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{modal.title}</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              <VStack align="stretch" spacing={4}>
                {modal.children.map((child) => (
                  <PluginComponentRenderer key={child.id} component={child} />
                ))}
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>
      ))}
    </PluginComponentContext.Provider>
  )
}
