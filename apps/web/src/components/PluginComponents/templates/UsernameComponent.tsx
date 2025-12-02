import { Text } from "@chakra-ui/react"
import { useListeners } from "../../../state/usersStore"
import type { User } from "../../../types/User"
import type { UsernameComponentProps } from "../../../types/PluginComponent"

/**
 * Username component - displays username for a given userId.
 * Looks up the username from the user list store.
 */
export function UsernameTemplateComponent({ userId }: UsernameComponentProps) {
  const listeners = useListeners()
  const user = listeners.find((u: User) => u.userId === userId)

  return <Text as="span">{user?.username || userId}</Text>
}

