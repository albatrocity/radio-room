import { Stack, Box, Wrap, WrapItem, Text } from "@chakra-ui/react"
import { FieldArrayRenderProps } from "formik"
import React from "react"
import { TriggerEvent } from "../../../types/Triggers"
import { Reaction } from "../../../types/Reaction"
import FieldSelect from "./FieldSelect"
import { ArrowDownIcon, ArrowForwardIcon } from "@chakra-ui/icons"
import FieldNumber from "./FieldNumber"
import RadioButtonGroup from "./RadioButtonGroup"
import FieldText from "./FieldText"

type Props = {
  index: number
  value: TriggerEvent<Reaction>
  actions: FieldArrayRenderProps
}

function FieldTriggerAction({ value, actions, index }: Props) {
  return (
    <Stack
      direction="column"
      spacing={4}
      align="center"
      borderWidth={1}
      borderStyle="solid"
      p={4}
      borderRadius="md"
      bg="secondaryBg"
    >
      <Stack direction="column" spacing={2}>
        <Wrap spacing={2} align="center">
          <WrapItem>
            <Text fontWeight="bold">On a Reaction to </Text>
          </WrapItem>
          <WrapItem>
            <FieldSelect size="sm" name={`triggers.${index}.subject.id`}>
              <option value="latest">latest</option>
            </FieldSelect>
          </WrapItem>
          <WrapItem>
            <FieldSelect size="sm" name={`triggers.${index}.subject.type`}>
              <option value="track">Track</option>
              <option value="message">Message</option>
            </FieldSelect>
            <Text>,</Text>
          </WrapItem>
          <WrapItem>
            <Text fontSize="sm">if the number of its Reactions where</Text>
          </WrapItem>
        </Wrap>

        <Stack direction="row" align="center" pl={4}>
          <ArrowForwardIcon />
          <Stack direction="column" spacing={2}>
            <Wrap>
              <WrapItem>
                <FieldText
                  size="sm"
                  name={`triggers.${index}.conditions.qualifier.sourceAttribute`}
                  w="8rem"
                  placeholder="reaction attribute"
                />
              </WrapItem>
              <WrapItem>
                <FieldSelect
                  size="sm"
                  name={`triggers.${index}.conditions.qualifier.comparator`}
                >
                  <option value="includes">includes</option>
                  <option value="equals">equals</option>
                </FieldSelect>
              </WrapItem>
              <WrapItem>
                <FieldText
                  size="sm"
                  name={`triggers.${index}.conditions.qualifier.determiner`}
                  w="8rem"
                />
              </WrapItem>
            </Wrap>
          </Stack>
        </Stack>

        <Stack direction="row" align="center" pl={4}>
          <Box w={4}>
            <Text fontSize="sm">is</Text>
          </Box>
          <Stack direction="column" spacing={2}>
            <Wrap align="center">
              <WrapItem>
                <FieldSelect
                  size="sm"
                  name={`triggers.${index}.conditions.comparator`}
                >
                  <option value="<">Less than</option>
                  <option value="<=">Less than or equal to</option>
                  <option value="=">Equal to</option>
                  <option value=">">Greater than</option>
                  <option value=">=">Greater than or equal to</option>
                </FieldSelect>
              </WrapItem>
              <WrapItem>
                <FieldNumber
                  size="sm"
                  w="5rem"
                  name={`triggers.${index}.conditions.threshold`}
                />
              </WrapItem>
              <WrapItem>
                <RadioButtonGroup
                  name={`triggers.${index}.conditions.thresholdType`}
                  options={[
                    { value: "percent", label: "%" },
                    { value: "count", label: "#" },
                  ]}
                />
              </WrapItem>
              <WrapItem>
                <Text fontSize="sm">of</Text>
              </WrapItem>
              <WrapItem>
                <FieldSelect
                  size="sm"
                  name={`triggers.${index}.conditions.compareTo`}
                >
                  <option value="listeners">Listeners</option>
                  <option value="users">All Users</option>
                  <option value="messages">Messages</option>
                  <option value="tracks">Tracks</option>
                  <option value="reactions">Reactions</option>
                </FieldSelect>
              </WrapItem>
            </Wrap>
          </Stack>
        </Stack>
      </Stack>
      <Stack direction="row" align="center">
        <ArrowDownIcon />
        <Text fontSize="sm">then</Text>
      </Stack>
      <FieldSelect size="lg" name={`triggers.${index}.action`}>
        <option value="likeTrack">Like Track</option>
        <option value="skipTrack">Skip Track</option>
        <option value="sendMessage">Send Message</option>
      </FieldSelect>
      <Stack direction="row" align="center">
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
      <Stack direction="row" align="center">
        <ArrowDownIcon />
        <Text fontSize="sm">with</Text>
      </Stack>
      <FieldText
        name={`triggers.${index}.meta.messageTemplate`}
        placeholder="Message Template"
      />
    </Stack>
  )
}

export default FieldTriggerAction
