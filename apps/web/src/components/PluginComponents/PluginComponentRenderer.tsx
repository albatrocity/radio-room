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
import { interpolateTemplate, interpolateCompositeTemplate } from "@repo/utils"
import { pluginComponentMachine } from "../../machines/pluginComponentMachine"
import { createTimerMachine } from "../../machines/TimerMachine"
import { getPluginComponentState } from "../../lib/serverApi"
import { useRoomStore } from "../../state/roomStore"
import { useListeners } from "../../state/usersStore"
import type { User } from "../../types/User"
import type {
  TemplateComponentName,
  TemplateComponentPropsMap,
  UsernameComponentProps,
  TextComponentProps,
  EmojiComponentProps,
  IconComponentProps,
  ButtonComponentProps,
  LeaderboardComponentProps,
  CountdownComponentProps,
  PluginComponentDefinition,
  PluginComponentState,
  PluginModalComponent,
  LeaderboardEntry,
  CompositeTemplate,
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
// Built-in Template Components
// ============================================================================

/**
 * Username component - displays username for a given userId.
 * Looks up the username from the user list store.
 */
function UsernameTemplateComponent({ userId }: UsernameComponentProps) {
  const listeners = useListeners()
  const user = listeners.find((u: User) => u.userId === userId)

  return <Text as="span">{user?.username || userId}</Text>
}

/**
 * Text component - renders text with optional styling.
 */
function TextTemplateComponent({ content, variant = "default" }: TextComponentProps) {
  const { store } = usePluginComponentContext()
  const interpolatedContent = interpolateTemplate(content, store)

  const fontWeight = variant === "bold" ? "bold" : "normal"
  const fontSize = variant === "small" ? "xs" : "sm"
  const color = variant === "muted" ? "gray.500" : undefined

  return (
    <Text as="span" fontSize={fontSize} fontWeight={fontWeight} color={color}>
      {interpolatedContent}
    </Text>
  )
}

/**
 * Emoji component - renders an emoji with optional size.
 */
function EmojiTemplateComponent({ emoji, size = "md" }: EmojiComponentProps) {
  const sizeMap = { sm: "16px", md: "24px", lg: "32px" }
  const fontSize = sizeMap[size]

  return (
    <Box as="span" fontSize={fontSize}>
      {/* @ts-ignore - em-emoji is a custom element from emoji-mart */}
      <em-emoji shortcodes={`:${emoji}:`} />
    </Box>
  )
}

/**
 * Icon component - renders an icon with optional styling.
 */
function IconTemplateComponent({ icon, size = "md", color }: IconComponentProps) {
  const IconComponent = getIcon(icon)
  if (!IconComponent) {
    console.warn(`[TemplateComponent] Unknown icon: ${icon}`)
    return null
  }

  const sizeMap = { sm: 3, md: 4, lg: 5 }
  const boxSize = sizeMap[size]

  return <Icon as={IconComponent} boxSize={boxSize} color={color} />
}

/**
 * Button component - renders a button that can open modals.
 */
function ButtonTemplateComponent({
  label,
  icon,
  opensModal,
  variant = "ghost",
  size = "sm",
}: ButtonComponentProps) {
  const { openModal } = usePluginComponentContext()
  const IconComponent = icon ? getIcon(icon) : undefined

  const handleClick = () => {
    if (opensModal) {
      openModal(opensModal)
    }
  }

  return (
    <Button
      size={size}
      variant={variant}
      leftIcon={IconComponent ? <Icon as={IconComponent} /> : undefined}
      onClick={handleClick}
    >
      {label}
    </Button>
  )
}

/**
 * Leaderboard component - renders a sorted list with scores.
 */
function LeaderboardTemplateComponent({
  dataKey,
  title,
  rowTemplate = "{{value}}: {{score}}",
  maxItems = 10,
  showRank = true,
}: LeaderboardComponentProps) {
  const { store } = usePluginComponentContext()

  const data = store[dataKey] as LeaderboardEntry[] | undefined
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
  const sortedData = [...data].sort((a, b) => b.score - a.score).slice(0, maxItems)

  return (
    <VStack align="stretch" spacing={2}>
      {title && (
        <Text fontSize="md" fontWeight="bold">
          {title}
        </Text>
      )}
      {sortedData.map((entry, index) => {
        const rank = index + 1
        const values = {
          value: entry.value,
          score: entry.score,
          rank,
        }

        // Render template content
        const templateContent = Array.isArray(rowTemplate) ? (
          <CompositeTemplateRenderer template={rowTemplate} values={values} />
        ) : (
          interpolateTemplate(rowTemplate, values)
        )

        return (
          <HStack key={entry.value} spacing={2}>
            {showRank && (
              <Text fontSize="sm" color="gray.500" minW="24px">
                {rank}.
              </Text>
            )}
            <Text fontSize="sm">{templateContent}</Text>
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

/**
 * Countdown component - shows a countdown timer with optional emoji.
 * Pulls start time from plugin store and manages timer state.
 */
/**
 * Countdown timer component.
 * Uses a key prop to force remount when start time changes, ensuring the timer restarts.
 */
function CountdownTemplateComponent({ startKey, duration, text }: CountdownComponentProps) {
  const { store, config } = usePluginComponentContext()

  // Get start timestamp from store
  const startValue = store[startKey]

  // Don't render if no valid start time
  if (startValue === null || startValue === undefined) {
    return null
  }

  const start =
    typeof startValue === "number"
      ? startValue
      : typeof startValue === "string"
      ? new Date(startValue).getTime()
      : Date.now()

  // Resolve duration - can be a number or a config path like "config.timeLimit"
  let resolvedDuration = typeof duration === "number" ? duration : 0
  if (typeof duration === "string" && duration.startsWith("config.")) {
    const configKey = duration.substring(7) // Remove "config." prefix
    const configValue = config[configKey]
    resolvedDuration = typeof configValue === "number" ? configValue : 0
  }

  // Use start time as key to force remount when track changes
  // This ensures the timer machine restarts with the new start time
  return (
    <CountdownTimerDisplay
      key={start}
      start={start}
      duration={resolvedDuration}
      text={text}
      config={config}
    />
  )
}

/**
 * Internal component that renders the actual countdown.
 * Separated so we can key it by start time for proper remounting.
 */
function CountdownTimerDisplay({
  start,
  duration,
  text,
  config,
}: {
  start: number
  duration: number
  text?: string | CompositeTemplate
  config: Record<string, unknown>
}) {
  const [state] = useMachine(createTimerMachine({ start, duration }))

  const isExpired = state.matches("expired")
  const remaining = Math.round(state.context.remaining / 1000)

  // Render text content (string or CompositeTemplate)
  const renderTextContent = () => {
    if (!text) return null

    // If text is a string, use simple template interpolation
    if (typeof text === "string") {
      return (
        <Text fontSize="xs" color="primaryBg">
          {interpolateTemplate(text, { config })}
        </Text>
      )
    }

    // If text is a CompositeTemplate, render components
    const interpolated = interpolateCompositeTemplate(text, { config })
    return (
      <Text fontSize="xs" color="primaryBg">
        {interpolated.map((part, index) => {
          const key =
            part.type === "text"
              ? `text-${index}-${part.content.substring(0, 20)}`
              : `component-${index}-${part.name}`

          if (part.type === "text") {
            return <React.Fragment key={key}>{part.content}</React.Fragment>
          } else if (part.type === "component") {
            return renderTemplateComponent(part.name, part.props, key)
          }
          return null
        })}
      </Text>
    )
  }

  return (
    <VStack spacing={1} align="start">
      {renderTextContent()}
      <HStack spacing={1}>
        <Text fontSize="sm" fontWeight="bold">
          {isExpired ? 0 : remaining}s
        </Text>
      </HStack>
    </VStack>
  )
}

/**
 * Strongly-typed map of built-in template component names to React components.
 * All frontends must implement these components for composite templates to work.
 */
const TEMPLATE_COMPONENT_MAP: {
  [K in TemplateComponentName]: React.ComponentType<TemplateComponentPropsMap[K]>
} = {
  username: UsernameTemplateComponent,
  text: TextTemplateComponent,
  emoji: EmojiTemplateComponent,
  icon: IconTemplateComponent,
  button: ButtonTemplateComponent,
  leaderboard: LeaderboardTemplateComponent,
  countdown: CountdownTemplateComponent,
}

/**
 * Renders a single template component part with type-safe props.
 */
function renderTemplateComponent(
  name: TemplateComponentName,
  props: Record<string, string>,
  key: string,
) {
  const Component = TEMPLATE_COMPONENT_MAP[name] as React.ComponentType<any>
  if (!Component) {
    console.warn(`[CompositeTemplate] Unknown component: ${name}`)
    return (
      <Text as="span" key={key}>
        [Unknown: {name}]
      </Text>
    )
  }
  return <Component key={key} {...props} />
}

/**
 * Renders a composite template (mix of text and components).
 */
function CompositeTemplateRenderer({
  template,
  values,
}: {
  template: CompositeTemplate
  values: Record<string, unknown>
}) {
  // Interpolate all variables in the template
  const interpolated = interpolateCompositeTemplate(template, values)

  return (
    <>
      {interpolated.map((part, index) => {
        // Generate a unique key based on part content
        const key =
          part.type === "text"
            ? `text-${index}-${part.content.substring(0, 20)}`
            : `component-${index}-${part.name}`

        if (part.type === "text") {
          return <React.Fragment key={key}>{part.content}</React.Fragment>
        } else if (part.type === "component") {
          return renderTemplateComponent(part.name, part.props, key)
        }
        return null
      })}
    </>
  )
}

// ============================================================================
// Component Renderer
// ============================================================================

/**
 * Interpolates config values in a component's props.
 * Replaces {{config.fieldName}} with actual config values.
 */
function interpolateConfigInProps(
  props: Record<string, any>,
  config: Record<string, unknown>,
): Record<string, any> {
  const interpolated: Record<string, any> = {}

  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string") {
      // Create a context object with config nested under "config" key
      interpolated[key] = interpolateTemplate(value, { config })
    } else if (Array.isArray(value)) {
      // Handle composite templates
      interpolated[key] = value.map((item) => {
        if (typeof item === "object" && item !== null) {
          return interpolateConfigInProps(item, config)
        }
        return item
      })
    } else if (typeof value === "object" && value !== null) {
      // Recursively interpolate nested objects
      interpolated[key] = interpolateConfigInProps(value, config)
    } else {
      interpolated[key] = value
    }
  }

  return interpolated
}

/**
 * Renders a single plugin component by delegating to its template component.
 * Plugin components are just template components + placement metadata.
 * Interpolates {{config.fieldName}} values at render time.
 */
function renderPluginComponent(
  component: PluginComponentDefinition,
  config: Record<string, unknown>,
) {
  // Special case: modals are rendered by the provider, not inline
  if (component.type === "modal") {
    return null
  }

  // Look up the template component and render with the component's props
  const TemplateComponent = TEMPLATE_COMPONENT_MAP[component.type] as React.ComponentType<any>

  if (!TemplateComponent) {
    console.warn(`[PluginComponent] Unknown component type: ${component.type}`)
    return null
  }

  // Extract only the template component props (exclude metadata)
  const { id, area, enabledWhen, subscribeTo, type, ...templateProps } = component

  // Interpolate config values in props
  const interpolatedProps = interpolateConfigInProps(templateProps, config)

  return <TemplateComponent {...interpolatedProps} />
}

// ============================================================================
// Main Renderer
// ============================================================================

interface PluginComponentRendererProps {
  component: PluginComponentDefinition
}

/**
 * Renders a single plugin component.
 * Plugin components are template components + placement metadata.
 * This function checks enabledWhen conditions and delegates to the appropriate template component.
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

  // Delegate to template component with config for interpolation
  return renderPluginComponent(component, config)
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
      {modalComponents.map((modal) => {
        // Interpolate config values in modal title
        const interpolatedTitle = interpolateTemplate(modal.title, { config })

        return (
          <Modal
            key={modal.id}
            isOpen={openModals.has(modal.id)}
            onClose={() => closeModal(modal.id)}
            size={modal.size || "md"}
          >
            <ModalOverlay />
            <ModalContent>
              <ModalHeader>{interpolatedTitle}</ModalHeader>
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
        )
      })}
    </PluginComponentContext.Provider>
  )
}
