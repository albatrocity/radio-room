import React from "react"
import { Box, RadioGroup, Stack, Radio, Text } from "@chakra-ui/react"
import { useSelector } from "@xstate/react"

import ThemePreview from "./ThemePreview"
import themes from "../themes"
import { AppTheme } from "../types/AppTheme"
import useGlobalContext from "./useGlobalContext"

function FormTheme() {
  const globalServices = useGlobalContext()
  const themeList = Object.keys(themes).map((key) => themes[key])
  const handleChange = (theme: AppTheme) => {
    globalServices.themeService.send("SET_THEME", { theme })
  }
  const themeValue = useSelector(
    globalServices.themeService,
    (state) => state.context.theme,
  )

  return (
    <Box>
      <RadioGroup value={themeValue} name="theme" onChange={handleChange}>
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
