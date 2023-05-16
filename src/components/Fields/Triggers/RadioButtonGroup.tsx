import {
  Box,
  Button,
  ButtonGroup,
  Radio,
  useRadio,
  useRadioGroup,
  useId,
} from "@chakra-ui/react"
import { useField } from "formik"
import React from "react"

interface Option {
  value: string
  label: string
}

function RadioButton(props: any) {
  const id = useId(props.id, `transformControlsModeIcons`)
  const { getInputProps, getCheckboxProps } = useRadio({
    id,
    ...props,
  })

  const input = getInputProps()
  const checkbox = getCheckboxProps()

  return (
    <>
      <Button
        cursor="pointer"
        aria-label={props.label}
        size="sm"
        as="label"
        htmlFor={input.id}
        variant={props.isChecked ? "solid" : "outline"}
        {...checkbox}
      >
        {props.label}
      </Button>
      <input {...input} />
    </>
  )
}

type Props = {
  name: string
  options: Option[]
}

function RadioButtonGroup({ name, options }: Props) {
  const [field, , { setValue }] = useField(name)
  const { getRootProps, getRadioProps } = useRadioGroup({
    name,
    value: field.value,
    onChange: setValue,
  })
  const group = getRootProps()
  return (
    <ButtonGroup {...group} isAttached>
      {options.map(({ value, label }) => {
        const radio = getRadioProps({ value })
        return (
          <RadioButton key={value} label={label} {...radio}>
            {label}
          </RadioButton>
        )
      })}
    </ButtonGroup>
  )
}

export default RadioButtonGroup
