import { AppTheme } from "../types/AppTheme"
import defaultTheme from "./default"
import watermelon from "./watermelon"
import grape from "./grape"
import tangerine from "./tangerine"
import grapefruit from "./grapefruit"
import raspberry from "./raspberry"
import banana from "./banana"
import plum from "./plum"
import strawberry from "./strawberry"
import dynamic from "./dynamic"

const themes: Record<string, AppTheme> = {
  defaultTheme,
  dynamic,
  watermelon,
  grape,
  tangerine,
  grapefruit,
  raspberry,
  banana,
  plum,
  strawberry,
}

export default themes
