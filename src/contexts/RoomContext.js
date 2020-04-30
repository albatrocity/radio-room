import React, { createContext } from "react"

import { initialState } from "../reducers/roomReducer"

const RoomContext = createContext(initialState)

export default RoomContext
