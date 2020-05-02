import React, { createContext } from "react"

import { initialState } from "../reducers/playerReducer"

const PlayerContext = createContext(initialState)

export default PlayerContext
