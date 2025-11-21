import React from "react"
import { useMachine } from "@xstate/react"

import { spotifySearchMachine } from "../machines/spotifySearchMachine"
import { Box, InputProps, Text } from "@chakra-ui/react"

import { Select, SingleValue } from "chakra-react-select"

import { SpotifyTrack } from "../types/SpotifyTrack"
import ItemSpotifyTrack from "./ItemSpotifyTrack"
import { debounceInputMachine } from "../machines/debouncedInputMachine"
import { useSpotifyAccessToken } from "../state/spotifyAuthStore"

type Props = {
  onChoose: (item: SingleValue<SpotifyTrack>) => void
  onDropdownOpenChange?: (isOpen: boolean) => void
} & InputProps

function SpotifySearch({ onChoose, onDropdownOpenChange }: Props) {
  const accessToken = useSpotifyAccessToken()
  const [state, send] = useMachine(spotifySearchMachine, {
    context: {
      accessToken,
    },
  })
  const [inputState, inputSend] = useMachine(debounceInputMachine, {
    actions: {
      onSearchChange: (_context, event) => {
        if (event.value && event.value !== "") send("FETCH_RESULTS", { value: event.value })
      },
    },
  })
  const results: SpotifyTrack[] = state.context.results
  const isMenuOpen =
    state.matches("idle") && results.length > 0 && inputState.context.searchValue !== ""

  return (
    <Box>
      {state.matches("failure") && <Text color="red">{state.context.error?.message}</Text>}

      <Select
        placeholder={"Search for a track on Spotify"}
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
        onMenuOpen={() => onDropdownOpenChange?.(true)}
        onMenuClose={() => onDropdownOpenChange?.(false)}
        openMenuOnFocus={false}
        openMenuOnClick={false}
      />
    </Box>
  )
}

export default SpotifySearch
