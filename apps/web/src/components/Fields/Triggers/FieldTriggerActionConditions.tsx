import { LuArrowRight } from "react-icons/lu"
import { Box, Stack, Wrap, Text } from "@chakra-ui/react"
import React from "react"
import FieldText from "../FieldText"
import FieldSelect from "../FieldSelect"
import FieldNumber from "../FieldNumber"
import RadioButtonGroup from "../RadioButtonGroup"
import { useField } from "formik"
import { TriggerEventString } from "../../../types/Triggers"

type Props = {
  index: number
  eventType: TriggerEventString
}

const FieldTriggerActionConditions = ({ index, eventType }: Props) => {
  const [thresholdTypeField] = useField(
    `triggers.${index}.conditions.thresholdType`,
  )
  return (
    <>
      <Stack direction="row" align="center" pl={4} w="100%">
        <LuArrowRight />
        <Stack direction="column" gap={2}>
          <Wrap>
            <FieldText
              size="sm"
              name={`triggers.${index}.conditions.qualifier.sourceAttribute`}
              w="8rem"
              placeholder={`${eventType} attribute`}
            />
            <FieldSelect
              size="sm"
              name={`triggers.${index}.conditions.qualifier.comparator`}
            >
              <option value="includes">includes</option>
              <option value="equals">equals</option>
            </FieldSelect>
            <FieldText
              size="sm"
              name={`triggers.${index}.conditions.qualifier.determiner`}
              w="8rem"
            />
          </Wrap>
        </Stack>
      </Stack>

      <Stack direction="row" align="center" pl={4}>
        <Box w={4}>
          <Text fontSize="sm">is</Text>
        </Box>
        <Stack direction="column" gap={2}>
          <Wrap align="center">
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
            <FieldNumber
              size="sm"
              w="5rem"
              name={`triggers.${index}.conditions.threshold`}
            />
            <RadioButtonGroup
              colorPalette="secondary"
              name={`triggers.${index}.conditions.thresholdType`}
              options={[
                { value: "percent", label: "%" },
                { value: "count", label: "#" },
              ]}
            />
            {thresholdTypeField.value === "percent" && (
              <>
                <Text fontSize="sm">of</Text>
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
              </>
            )}
          </Wrap>
        </Stack>
      </Stack>
    </>
  )
}

export default FieldTriggerActionConditions
