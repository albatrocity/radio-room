import React from "react"
import { useMachine } from "@xstate/react"

import { trackSearchMachine } from "../machines/trackSearchMachine"
import { Box, InputProps, Text } from "@chakra-ui/react"

import { Select, SingleValue } from "chakra-react-select"

import { MetadataSourceTrack } from "@repo/types"
import TrackItem from "./TrackItem"
import { debounceInputMachine } from "../machines/debouncedInputMachine"

type Props = {
  onChoose: (item: SingleValue<MetadataSourceTrack>) => void
  onDropdownOpenChange?: (isOpen: boolean) => void
} & InputProps

function TrackSearch({ onChoose, onDropdownOpenChange }: Props) {
  const [state, send] = useMachine(trackSearchMachine)
  const [inputState, inputSend] = useMachine(debounceInputMachine, {
    actions: {
      onSearchChange: (_context, event) => {
        if (event.value && event.value !== "") send("FETCH_RESULTS", { value: event.value })
      },
    },
  })
  const results = state.context.results
  const isMenuOpen =
    state.matches("idle") && results.length > 0 && inputState.context.searchValue !== ""

  return (
    <Box>
      {state.matches("failure") && <Text color="red">{state.context.error?.message}</Text>}

      <Select
        placeholder={"Search for a track"}
        options={results}
        menuIsOpen={isMenuOpen}
        filterOption={() => true}
        isLoading={state.matches("loading")}
        autoFocus={true}
        closeMenuOnSelect={true}
        components={{
          DropdownIndicator: null,
          Option: ({ data, innerRef, innerProps, isFocused }) => (
            <Box ref={innerRef} {...innerProps} bg={isFocused ? "actionBgLite" : "transparent"}>
              <TrackItem {...data} />
            </Box>
          ),
        }}
        onInputChange={(value) => {
          inputSend("SET_VALUE", { value })
        }}
        onChange={(value) => {
          onChoose(value)
        }}
        onMenuOpen={() => onDropdownOpenChange?.(true)}
        onMenuClose={() => onDropdownOpenChange?.(false)}
        openMenuOnFocus={false}
        openMenuOnClick={false}
      />
    </Box>
  )
}

export default TrackSearch
