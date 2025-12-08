import { Text } from "@chakra-ui/react"
import { useListeners } from "../../../hooks/useActors"
import type { User } from "../../../types/User"
import type { UsernameComponentProps } from "../../../types/PluginComponent"

/**
 * Username component - displays username for a given userId.
 * Looks up the username from the user list store.
 * Falls back to the provided fallback prop, then to userId if not found.
 */
export function UsernameTemplateComponent({ userId, fallback }: UsernameComponentProps) {
  const listeners = useListeners()
  const user = listeners.find((u: User) => u.userId === userId)

  return <Text as="span">{user?.username || fallback || userId}</Text>
}
