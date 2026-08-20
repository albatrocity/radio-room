import type { ReactNode } from "react"
import { Button, HStack, Text, type StackProps } from "@chakra-ui/react"

export type PathBreadcrumbItem = {
  label: string
  /** When set, crumb is a plain action button (e.g. navigate up). */
  onClick?: () => void
  /** Optional leading icon (typically on the first crumb). */
  icon?: ReactNode
}

type Props = {
  items: PathBreadcrumbItem[]
  /** Button/text size; CatalogBrowse uses `xs`, Game State detail uses `sm`. */
  size?: "xs" | "sm"
} & Omit<StackProps, "children">

/**
 * Single-line path breadcrumb. Does not wrap; crumbs shrink with the last
 * segment preferred for visibility (earlier crumbs shrink first).
 */
export default function PathBreadcrumb({ items, size = "xs", ...stackProps }: Props) {
  if (items.length === 0) return null

  return (
    <HStack
      gap={1}
      w="100%"
      minW={0}
      flexWrap="nowrap"
      overflow="hidden"
      fontSize="sm"
      align="center"
      {...stackProps}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        // Earlier crumbs shrink first (flexShrink 2); last keeps priority (1)
        // but can still truncate when space is very tight.
        return (
          <HStack
            key={`${item.label}-${i}`}
            gap={1}
            minW={isLast ? "8ch" : 0}
            flex={isLast ? "1 1 auto" : "0 1 auto"}
            flexShrink={isLast ? 1 : 2}
            overflow="hidden"
            align="center"
          >
            {i > 0 ? (
              <Text color="fg.muted" aria-hidden flexShrink={0}>
                /
              </Text>
            ) : null}
            {item.onClick ? (
              <Button
                type="button"
                variant="plain"
                size={size}
                colorPalette="action"
                onClick={item.onClick}
                px={i === 0 && item.icon ? 0 : 1}
                minW={0}
                h="auto"
                fontWeight="medium"
                overflow="hidden"
                justifyContent="flex-start"
              >
                {item.icon}
                <Text as="span" truncate minW={0}>
                  {item.label}
                </Text>
              </Button>
            ) : (
              <Text
                color={isLast ? "fg" : undefined}
                fontWeight={isLast ? "semibold" : "normal"}
                truncate
                minW={0}
              >
                {item.label}
              </Text>
            )}
          </HStack>
        )
      })}
    </HStack>
  )
}
