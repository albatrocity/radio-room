import React from "react"
import { useMachine } from "@xstate/react"

import { spotifySearchMachine } from "../machines/spotifySearchMachine"
import { Box, InputProps, Text } from "@chakra-ui/react"

import { Select, SingleValue } from "chakra-react-select"

import { SpotifyTrack } from "../types/SpotifyTrack"
import ItemSpotifyTrack from "./ItemSpotifyTrack"
import { debounceInputMachine } from "../machines/debouncedInputMachine"

type Props = {
  onChoose: (item: SingleValue<SpotifyTrack>) => void
} & InputProps

function SpotifySearch({ onChoose, ...rest }: Props) {
  const [state, send] = useMachine(spotifySearchMachine)
  const [inputState, inputSend] = useMachine(debounceInputMachine, {
    actions: {
      onSearchChange: (_context, event) => {
        if (event.value && event.value !== "")
          send("FETCH_RESULTS", { value: event.value })
      },
    },
  })
  const results: SpotifyTrack[] = state.context.results
  const isMenuOpen =
    state.matches("idle") &&
    results.length > 0 &&
    inputState.context.searchValue !== ""

  return (
    <Box>
      {state.matches("failure") && (
        <Text color="red">{state.context.error?.message}</Text>
      )}

      <Select
        placeholder={"Search for a track on Spotify"}
        options={results}
        menuIsOpen={isMenuOpen}
        filterOption={() => true}
        isLoading={state.matches("loading")}
        autoFocus={true}
        components={{
          DropdownIndicator: null,
          Option: ({ data, innerRef, innerProps, isFocused }) => (
            <Box
              ref={innerRef}
              {...innerProps}
              bg={isFocused ? "actionBgLite" : "transparent"}
            >
              <ItemSpotifyTrack {...data} />
            </Box>
          ),
        }}
        onInputChange={(value) => {
          inputSend("SET_VALUE", { value })
        }}
        onChange={(value) => {
          onChoose(value)
        }}
      />
    </Box>
  )
}

export default SpotifySearch
