import { Stack, Wrap, WrapItem, Text, Collapse, Button } from "@chakra-ui/react"
import { FieldArrayRenderProps } from "formik"
import React from "react"
import { TriggerEvent, TriggerEventString } from "../../../types/Triggers"
import FieldSelect from "../FieldSelect"
import { AddIcon, ArrowDownIcon, DeleteIcon } from "@chakra-ui/icons"
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
      spacing={4}
      align="flex-start"
      borderWidth={1}
      borderStyle="solid"
      p={4}
      borderRadius="md"
      bg="secondaryBg"
      w="100%"
    >
      <Stack direction="column" spacing={2} w="100%">
        <Wrap spacing={2} align="center">
          <WrapItem>
            <Text fontWeight="bold">
              On a {eventType} {eventType === "reaction" && "to"}{" "}
            </Text>
          </WrapItem>
          {eventType === "reaction" && (
            <>
              <WrapItem>
                <FieldSelect size="sm" name={`triggers.${index}.target.id`}>
                  <option value="latest">latest</option>
                </FieldSelect>
              </WrapItem>
              <WrapItem>
                <FieldSelect size="sm" name={`triggers.${index}.target.type`}>
                  <option value="track">Track</option>
                  <option value="message">Message</option>
                </FieldSelect>
                {hasConditions && <Text>,</Text>}
              </WrapItem>
            </>
          )}
          <WrapItem>
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
                colorScheme="secondary"
                variant="ghost"
                rightIcon={<AddIcon boxSize="0.5rem" />}
              >
                Add conditions
              </Button>
            )}
          </WrapItem>
        </Wrap>

        <Collapse in={hasConditions}>
          <Stack direction="column" spacing={2} w="100%">
            <FieldTriggerActionConditions eventType={eventType} index={index} />
            <Button
              size="xs"
              colorScheme="red"
              variant="ghost"
              onClick={removeConditions}
            >
              Clear conditions
            </Button>
            <Stack direction="row" align="center" justify="center">
              <ArrowDownIcon />
              <Text fontSize="sm">then</Text>
            </Stack>
          </Stack>
        </Collapse>
      </Stack>
      <FieldSelect size="lg" name={`triggers.${index}.action`}>
        <option value="likeTrack">Like Track</option>
        <option value="skipTrack">Skip Track</option>
        <option value="sendMessage">Send Message</option>
      </FieldSelect>
      {hasConditions && (
        <Stack direction="row" align="center" justify="center" w="100%">
          <Wrap align="center">
            <WrapItem>
              <Text fontSize="sm">a maximum of</Text>
            </WrapItem>
            <WrapItem>
              <FieldNumber
                size="sm"
                w="4rem"
                name={`triggers.${index}.conditions.maxTimes`}
              />
            </WrapItem>
            <WrapItem>
              <Text fontSize="sm">times</Text>
            </WrapItem>
          </Wrap>
        </Stack>
      )}
      <Stack direction="row" align="center" justify="center" w="100%">
        <ArrowDownIcon />
        <Text fontSize="sm">with</Text>
      </Stack>
      <FieldText
        name={`triggers.${index}.meta.messageTemplate`}
        placeholder="Message Template"
        fontFamily={"'MonoLisa Trial', mono"}
      />
      <Button
        leftIcon={<DeleteIcon />}
        size="xs"
        variant="outline"
        colorScheme="red"
        onClick={() => actions.remove(index)}
      >
        Remove Action
      </Button>
    </Stack>
  )
}

export default FieldTriggerAction
