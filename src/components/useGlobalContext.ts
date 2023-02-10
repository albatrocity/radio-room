import { useContext } from "react"
import { GlobalStateContext } from "../contexts/global"

export default function useGlobalContext() {
  const globalServices = useContext(GlobalStateContext)

  return globalServices
}
