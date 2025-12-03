import React from "react"
import { Box, RadioGroup, Stack, Text } from "@chakra-ui/react"

import ThemePreview from "./ThemePreview"
import themes from "../themes"
import { AppTheme } from "../types/AppTheme"
import { useThemeStore } from "../state/themeStore"

function FormTheme() {
  const themeList = Object.keys(themes).map((key) => themes[key])
  const { send } = useThemeStore()
  const currentTheme = useThemeStore((s) => s.state.context.theme)
  const handleChange = (details: { value: string }) => {
    send("SET_THEME", { theme: details.value as AppTheme["id"] })
  }

  return (
    <Box>
      <RadioGroup.Root value={currentTheme} name="theme" onValueChange={handleChange}>
        <Stack>
          {themeList.map((theme) => (
            <RadioGroup.Item key={theme.id} value={theme.id}>
              <RadioGroup.ItemHiddenInput />
              <RadioGroup.ItemControl />
              <RadioGroup.ItemText>
                <Stack direction="row">
                  <ThemePreview theme={theme} />{" "}
                  <Text fontSize="sm">{theme.name}</Text>
                </Stack>
              </RadioGroup.ItemText>
            </RadioGroup.Item>
          ))}
        </Stack>
      </RadioGroup.Root>
    </Box>
  )
}

export default FormTheme
