import { Box, Icon } from "@chakra-ui/react"
import { LuStar } from "react-icons/lu"
import type { UserPersona } from "@repo/types"
import { Tooltip } from "./ui/tooltip"
import { getIcon } from "./PluginComponents/icons"

interface PersonaBadgeProps {
  persona: UserPersona
  boxSize?: number
  color?: string
}

export function PersonaBadge({ persona, boxSize = 3, color }: PersonaBadgeProps) {
  const IconComponent = getIcon(persona.icon ?? "Star") ?? LuStar

  return (
    <Tooltip content={persona.label} positioning={{ placement: "top" }}>
      <Box>
        <Icon
          as={IconComponent}
          boxSize={boxSize}
          color={color}
          flexShrink={0}
          aria-label={persona.label}
        />
      </Box>
    </Tooltip>
  )
}
