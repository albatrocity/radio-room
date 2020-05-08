import { createContext } from "react"

const AuthContext = createContext({ state: { currentUser: null } })

export default AuthContext
