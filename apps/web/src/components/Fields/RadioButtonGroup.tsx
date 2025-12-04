import {
  Box,
  Button,
  Group,
  RadioGroup,
} from "@chakra-ui/react"
import { useField } from "formik"
import React from "react"

interface Option {
  value: string
  label: string
}

type Props = {
  name: string
  options: Option[]
  colorPalette?: string
}

function RadioButtonGroup({ name, options, colorPalette }: Props) {
  const [field, , { setValue }] = useField(name)

  return (
    <RadioGroup.Root
      name={name}
      value={field.value}
      onValueChange={(details) => setValue(details.value)}
    >
      <Group attached>
        {options.map(({ value, label }) => (
          <RadioGroup.Item key={value} value={value}>
            <RadioGroup.ItemHiddenInput />
            <Button
              asChild
              cursor="pointer"
              aria-label={label}
              size="sm"
              colorPalette={colorPalette}
              variant={field.value === value ? "solid" : "outline"}
            >
              <label>{label}</label>
            </Button>
          </RadioGroup.Item>
        ))}
      </Group>
    </RadioGroup.Root>
  )
}

export default RadioButtonGroup
