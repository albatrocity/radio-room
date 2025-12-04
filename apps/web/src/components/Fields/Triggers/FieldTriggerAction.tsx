import { Stack, Wrap, Text, Collapsible, Button } from "@chakra-ui/react"
import { FieldArrayRenderProps } from "formik"
import React from "react"
import { TriggerEvent, TriggerEventString } from "../../../types/Triggers"
import FieldSelect from "../FieldSelect"
import { LuPlus, LuArrowDown, LuTrash2 } from "react-icons/lu"
import FieldNumber from "../FieldNumber"
import FieldText from "../FieldText"
import FieldTriggerActionConditions from "./FieldTriggerActionConditions"

type Props<T> = {
  index: number
  value: TriggerEvent<T>
  actions: FieldArrayRenderProps
  eventType: TriggerEventString
}

function FieldTriggerAction<T extends object>({
  value,
  actions,
  index,
  eventType,
}: Props<T>) {
  const hasConditions = !!value.conditions
  const removeConditions = () => {
    actions.form.setFieldValue(`triggers.${index}.conditions`, undefined)
  }
  const setupConditions = () => {
    actions.form.setFieldValue(`triggers.${index}.conditions`, {
      maxTimes: undefined,
      qualifier: {
        sourceAttribute: "",
        comparator: "equals",
        determiner: "",
      },
      comparator: "=",
      threshold: "1",
      thresholdType: "count",
      compareTo: "users",
    })
  }

  return (
    <Stack
      direction="column"
      gap={4}
      align="flex-start"
      borderWidth={1}
      borderStyle="solid"
      p={4}
      borderRadius="md"
      bg="secondaryBg"
      w="100%"
    >
      <Stack direction="column" gap={2} w="100%">
        <Wrap gap={2} align="center">
          <Text fontWeight="bold">
            On a {eventType} {eventType === "reaction" && "to"}{" "}
          </Text>
          {eventType === "reaction" && (
            <>
              <FieldSelect size="sm" name={`triggers.${index}.target.id`}>
                <option value="latest">latest</option>
              </FieldSelect>
              <FieldSelect size="sm" name={`triggers.${index}.target.type`}>
                <option value="track">Track</option>
                <option value="message">Message</option>
              </FieldSelect>
              {hasConditions && <Text>,</Text>}
            </>
          )}
          {hasConditions ? (
            <Text fontSize="sm">
              if{" "}
              {eventType === "reaction" &&
                "the number of its reactions where"}
            </Text>
          ) : (
            <Button
              onClick={setupConditions}
              size="sm"
              colorPalette="secondary"
              variant="ghost"
            >
              Add conditions
              <LuPlus size="0.5rem" />
            </Button>
          )}
        </Wrap>

        <Collapsible.Root open={hasConditions}>
          <Collapsible.Content>
            <Stack direction="column" gap={2} w="100%">
              <FieldTriggerActionConditions eventType={eventType} index={index} />
              <Button
                size="xs"
                colorPalette="red"
                variant="ghost"
                onClick={removeConditions}
              >
                Clear conditions
              </Button>
              <Stack direction="row" align="center" justify="center">
                <LuArrowDown />
                <Text fontSize="sm">then</Text>
              </Stack>
            </Stack>
          </Collapsible.Content>
        </Collapsible.Root>
      </Stack>
      <FieldSelect size="lg" name={`triggers.${index}.action`}>
        <option value="likeTrack">Like Track</option>
        <option value="skipTrack">Skip Track</option>
        <option value="sendMessage">Send Message</option>
        <option value="pause">Pause playback</option>
        <option value="resume">Resume playback</option>
      </FieldSelect>
      {hasConditions && (
        <Stack direction="row" align="center" justify="center" w="100%">
          <Wrap align="center">
            <Text fontSize="sm">a maximum of</Text>
            <FieldNumber
              size="sm"
              w="4rem"
              name={`triggers.${index}.conditions.maxTimes`}
            />
            <Text fontSize="sm">times</Text>
          </Wrap>
        </Stack>
      )}
      <Stack direction="row" align="center" justify="center" w="100%">
        <LuArrowDown />
        <Text fontSize="sm">with</Text>
      </Stack>
      <FieldText
        name={`triggers.${index}.meta.messageTemplate`}
        placeholder="Message Template"
        fontFamily={"'MonoLisa Trial', mono"}
      />
      <Button
        size="xs"
        variant="outline"
        colorPalette="red"
        onClick={() => actions.remove(index)}
      >
        <LuTrash2 />
        Remove Action
      </Button>
    </Stack>
  )
}

export default FieldTriggerAction
