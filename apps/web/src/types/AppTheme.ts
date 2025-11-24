import { ColorHues } from "@chakra-ui/react"

export interface AppTheme {
  name: string
  id: string
  colors: {
    primary: ColorHues
    secondary: ColorHues
    action: ColorHues
  }
}
