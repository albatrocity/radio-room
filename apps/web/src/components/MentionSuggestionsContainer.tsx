import { ReactNode } from "react"
import { Box } from "@chakra-ui/react"

const MentionSuggestionsContainer = (children: ReactNode) => {
  return (
    <Box
      p={2}
      borderRadius={4}
      border="solid"
      borderColor="secondaryBorder"
      borderWidth={1}
      bg="appBg"
    >
      {children}
    </Box>
  )
}

export default MentionSuggestionsContainer
