import { useCallback, useEffect, useMemo } from "react"
import { useMachine } from "@xstate/react"
import { HStack, Slider, Text } from "@chakra-ui/react"
import { emitToSocket } from "../../../actors/socketActor"
import { usePluginComponentContext } from "../context"
import { createSliderMachine } from "../../../machines/sliderMachine"
import { getIcon } from "../icons"
import { SvgIcon } from "../../ui/svg-icon"
import type { SliderComponentProps } from "../../../types/PluginComponent"

interface SliderTemplateComponentProps extends SliderComponentProps {
  pluginName?: string
}

export function SliderTemplateComponent({
  dataKey,
  label,
  icon,
  min = 0,
  max = 100,
  step = 1,
  action,
  paramKey,
  pluginName,
}: SliderTemplateComponentProps) {
  const { store, textColor } = usePluginComponentContext()
  const storeValue = store[dataKey]
  const externalValue =
    typeof storeValue === "number" && Number.isFinite(storeValue) ? storeValue : min

  const resolvedParamKey = paramKey ?? dataKey

  const dispatchValue = useCallback(
    (value: number) => {
      if (!pluginName) {
        console.warn("[PluginSlider] action set but pluginName missing; skipping dispatch", action)
        return
      }

      const clamped = Math.round(Math.max(min, Math.min(max, value)))
      emitToSocket("EXECUTE_PLUGIN_ACTION", {
        pluginName,
        action,
        params: { [resolvedParamKey]: clamped },
      })
    },
    [action, max, min, resolvedParamKey, pluginName],
  )

  const sliderMachine = useMemo(
    () => createSliderMachine(dispatchValue),
    [dispatchValue],
  )

  const [state, send] = useMachine(sliderMachine, {
    input: { initialValue: externalValue },
  })

  // Sync external store value changes to the machine
  useEffect(() => {
    send({ type: "SYNC_EXTERNAL", value: externalValue })
  }, [externalValue, send])

  const displayValue = state.context.displayValue

  const handleValueChange = (details: { value: number[] }) => {
    send({ type: "DRAG", value: details.value[0] ?? min })
  }

  const handleValueChangeEnd = (details: { value: number[] }) => {
    send({ type: "RELEASE", value: details.value[0] ?? min })
  }

  const IconComponent = icon ? getIcon(icon) : undefined
  const labelColor = textColor ?? "fg.muted"

  return (
    <HStack gap={3} w="100%" align="center">
      {IconComponent ? (
        <SvgIcon icon={IconComponent} boxSize={4} color={labelColor} flexShrink={0} />
      ) : label ? (
        <Text fontSize="xs" color={labelColor} flexShrink={0}>
          {label}
        </Text>
      ) : null}
      <Slider.Root
        aria-label={label ? [label] : ["Slider"]}
        value={[displayValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={handleValueChange}
        onValueChangeEnd={handleValueChangeEnd}
        variant="solid"
        colorPalette="action"
        flex="1"
      >
        <Slider.Control>
          <Slider.Track>
            <Slider.Range />
          </Slider.Track>
          <Slider.Thumbs boxSize={3.5} />
        </Slider.Control>
      </Slider.Root>
      <Text fontSize="xs" color={labelColor} minW="2.5rem" textAlign="right">
        {Math.round(displayValue)}%
      </Text>
    </HStack>
  )
}
