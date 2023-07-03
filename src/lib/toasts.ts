import { createStandaloneToast } from "@chakra-ui/react"
import theme from "../themes/default"

const { toast } = createStandaloneToast({
  defaultOptions: {
    position: "top",
    isClosable: true,
  },
  theme,
})

export { toast }
