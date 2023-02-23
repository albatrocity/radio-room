import React from "react"
import { useMachine, useSelector } from "@xstate/react"

import InputDebounced from "./InputDebounced"
import { spotifySearchMachine } from "../machines/spotifySearchMachine"
import { Box, List, ListItem, Text, UnorderedList } from "@chakra-ui/react"

type Props = { onChange: (value: string) => void }

function SpotifySearch({}: Props) {
  const [state, send] = useMachine(spotifySearchMachine)
  const results = state.context.results

  console.log(state.context)

  return (
    <Box>
      {state.matches("failure") && (
        <Text color="red">{state.context.error?.message}</Text>
      )}
      <InputDebounced
        onChange={(value) => {
          send("FETCH_RESULTS", { value })
        }}
      />
      <UnorderedList>
        {results.map(({ name, id }) => (
          <ListItem key={id}>{name}</ListItem>
        ))}
      </UnorderedList>
    </Box>
  )
}

export default SpotifySearch
