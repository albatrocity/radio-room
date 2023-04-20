import React from "react"
import { Box, RadioGroup, Stack, Radio, Text } from "@chakra-ui/react"

import ThemePreview from "./ThemePreview"
import themes from "../themes"
import { AppTheme } from "../types/AppTheme"
import { useThemeStore } from "../state/themeStore"

function FormTheme() {
  const themeList = Object.keys(themes).map((key) => themes[key])
  const { send } = useThemeStore()
  const currentTheme = useThemeStore((s) => s.state.context.theme)
  const handleChange = (theme: AppTheme["id"]) => {
    send("SET_THEME", { theme })
  }

  return (
    <Box>
      <RadioGroup value={currentTheme} name="theme" onChange={handleChange}>
        <Stack>
          {themeList.map((theme) => (
            <Radio key={theme.id} value={theme.id}>
              <Stack direction="row">
                <ThemePreview theme={theme} />{" "}
                <Text fontSize="sm">{theme.name}</Text>
              </Stack>
            </Radio>
          ))}
        </Stack>
      </RadioGroup>
    </Box>
  )
}

export default FormTheme
