// Color scale type matching Chakra UI's color palette structure
export type ColorHues = {
  50: string
  100: string
  200: string
  300: string
  400: string
  500: string
  600: string
  700: string
  800: string
  900: string
}

export interface AppTheme {
  name: string
  id: string
  colors: {
    primary: ColorHues
    secondary: ColorHues
    action: ColorHues
  }
}
