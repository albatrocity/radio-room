import { AppTheme } from "../types/AppTheme"
import defaultTheme from "./default"
import watermelon from "./watermelon"
import grape from "./grape"
import tangerine from "./tangerine"
import grapefruit from "./grapefruit"
import raspberry from "./raspberry"

const themes: Record<string, AppTheme> = {
  defaultTheme,
  watermelon,
  grape,
  tangerine,
  grapefruit,
  raspberry,
}

export default themes
