import { Box } from "@chakra-ui/react"
import type { SystemStyleObject } from "@chakra-ui/react"
import type { ReactNode, Ref } from "react"

/**
 * Disable browser scroll anchoring so it does not fight measurement
 * adjustments. TanStack Virtual also needs this for iOS momentum.
 */
export const virtualizerViewportCss: SystemStyleObject = {
  overflowAnchor: "none",
}

type Props = {
  totalSize: number
  children: ReactNode
  contentRef?: Ref<HTMLDivElement>
}

/**
 * In-flow sizer for absolutely positioned virtual rows. iOS Safari often
 * ignores CSS height on a box whose children are all `position: absolute`,
 * which clips `scrollHeight` to the painted rows and kills momentum when
 * the fling reaches unrendered items.
 */
function VirtualizerContent({ totalSize, children, contentRef }: Props) {
  return (
    <Box ref={contentRef} position="relative" width="100%" flexShrink={0}>
      <Box height={`${totalSize}px`} width="100%" pointerEvents="none" aria-hidden />
      {children}
    </Box>
  )
}

export default VirtualizerContent
