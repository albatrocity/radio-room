import { Flex } from "@chakra-ui/react"
import { ReactNode } from "react"
import { PageContent } from "./PageContent"
import { useSchedulerLayout } from "./SchedulerLayoutContext"

export function ManagedOverflowContainer({ children }: { children: ReactNode }) {
  const { mobileHeaderOuterHeightPx } = useSchedulerLayout()
  const subtractPx = mobileHeaderOuterHeightPx > 0 ? mobileHeaderOuterHeightPx : "3.5rem"
  const baseHeight =
    typeof subtractPx === "number"
      ? `calc(100dvh - ${subtractPx}px)`
      : `calc(100dvh - ${subtractPx})`

  return (
    <Flex
      className="managed-overflow-container"
      direction="column"
      minW={0}
      minH="0"
      h={[baseHeight, "100vh"]}
      overflow="hidden"
    >
      <PageContent>{children}</PageContent>
    </Flex>
  )
}
