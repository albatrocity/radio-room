import { Button, Icon } from "@chakra-ui/react"
import { getIcon } from "../icons"
import { usePluginComponentContext } from "../context"
import type { ButtonComponentProps } from "../../../types/PluginComponent"

/**
 * Button component - renders a button that can open modals.
 */
export function ButtonTemplateComponent({
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

