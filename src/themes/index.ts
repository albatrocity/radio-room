import { AppTheme } from "../types/AppTheme"
import defaultTheme from "./default"
import watermelon from "./watermelon"
import grape from "./grape"

const themes: Record<string, AppTheme> = {
  defaultTheme,
  watermelon,
  grape,
}

export default themes
