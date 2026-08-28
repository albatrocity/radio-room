import { Icon } from "@chakra-ui/react"
import { LuChevronRight } from "react-icons/lu"

/**
 * Trailing affordance for a list row that opens item detail (ADR 0104 / 0126).
 * Decorative when the parent row is already the button; pass `onClick` when
 * the caret sits outside that click target (shop / bag action columns).
 */
export function ItemDetailRowCaret({ onClick }: { onClick?: () => void }) {
  return (
    <Icon
      as={LuChevronRight}
      boxSize="1.25rem"
      color="fg.muted"
      flexShrink={0}
      aria-hidden
      cursor={onClick ? "pointer" : undefined}
      onClick={
        onClick
          ? (event) => {
              event.stopPropagation()
              onClick()
            }
          : undefined
      }
    />
  )
}
