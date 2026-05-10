import type { ComponentType, SVGAttributes } from "react"
import { Box, type BoxProps } from "@chakra-ui/react"

export type SvgIconProps = Omit<BoxProps, "children" | "as"> & {
  icon: ComponentType<SVGAttributes<SVGSVGElement> & { size?: string | number }>
}

/**
 * Renders react-icons without Chakra `Icon`'s `as` prop. Those icons are plain
 * function components (no forwardRef); Chakra forwards a ref and triggers a
 * runtime warning when using `<Icon as={LuSomething} />`.
 */
export function SvgIcon({ icon: IconComponent, boxSize, color, ...rest }: SvgIconProps) {
  return (
    <Box
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      lineHeight={0}
      boxSize={boxSize}
      color={color}
      {...rest}
    >
      {boxSize != null ? <IconComponent size="100%" /> : <IconComponent />}
    </Box>
  )
}
